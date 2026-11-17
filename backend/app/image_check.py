"""Checks an incident photo with a vision model before the report is accepted.

Uses Google Gemini when GEMINI_API_KEY is set, otherwise OpenAI when
OPENAI_API_KEY is set, otherwise Claude when an Anthropic key is set. With
none of them, reports are refused.

The model is asked three things: is this a road scene, does it look like a
genuine photo taken on the spot (not a screenshot, stock image, drawing or
obviously generated picture), and does it show a blockage or heavy
congestion. It judges only what is visible, so it cannot prove a photo is
recent or taken at the reported location.
"""

import base64
import json
import os
from typing import Literal

import anthropic
import httpx
import openai
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel

from app.config import settings

BlockageType = Literal[
    "accident", "closure", "construction", "congestion", "flooding", "other", "none"
]


class ImageVerdict(BaseModel):
    is_road_scene: bool
    appears_genuine: bool
    shows_blockage: bool
    blockage_type: BlockageType
    severity: Literal["none", "minor", "moderate", "severe"]
    # One or two plain sentences shown to the person who reported it.
    reason: str

    @property
    def accepted(self) -> bool:
        return self.is_road_scene and self.appears_genuine and self.shows_blockage


class VerifierNotConfigured(Exception):
    """No Anthropic credentials are available, so photos can't be checked."""


class VerifierError(Exception):
    """The check could not be completed (network, rate limit, refusal...)."""


VERDICT_SCHEMA = {
    "type": "object",
    "properties": {
        "is_road_scene": {"type": "boolean"},
        "appears_genuine": {"type": "boolean"},
        "shows_blockage": {"type": "boolean"},
        "blockage_type": {
            "type": "string",
            "enum": ["accident", "closure", "construction", "congestion", "flooding", "other", "none"],
        },
        "severity": {"type": "string", "enum": ["none", "minor", "moderate", "severe"]},
        "reason": {"type": "string"},
    },
    "required": [
        "is_road_scene",
        "appears_genuine",
        "shows_blockage",
        "blockage_type",
        "severity",
        "reason",
    ],
    "additionalProperties": False,
}

SYSTEM = """You review photos that commuters upload to CityFlow, a Bengaluru traffic app, \
when they report that a road is blocked. Other drivers are warned on the strength of an \
accepted report, so a wrong acceptance sends people on needless detours and a wrong \
rejection hides a real blockage.

Judge only what is visible in the photo:

- is_road_scene: the photo shows a road, junction, flyover or street with traffic context.
- appears_genuine: it looks like a real photo taken at the scene. Set this to false for \
screenshots of maps or apps, photos of another screen, stock or news images with watermarks \
or captions, drawings, memes, and images with clear signs of being generated or edited. \
You cannot verify when or where a photo was taken; do not guess about that.
- shows_blockage: the road is visibly blocked or heavily congested, for example a crash, \
a closed or barricaded road, road works narrowing the carriageway, flooding, a fallen tree, \
or vehicles packed bumper to bumper and not moving freely. Ordinary flowing traffic is not \
a blockage.
- blockage_type: the closest category, or "none" when there is no blockage.
- severity: how much of the road is affected, or "none".
- reason: one or two short, plain sentences for the person who uploaded the photo, saying \
what you saw and why the report was or was not accepted."""


def _gemini_key() -> str | None:
    return settings.gemini_api_key or os.environ.get("GEMINI_API_KEY")


def _openai_key() -> str | None:
    return settings.openai_api_key or os.environ.get("OPENAI_API_KEY")


def _anthropic_configured() -> bool:
    return bool(
        settings.anthropic_api_key
        or os.environ.get("ANTHROPIC_API_KEY")
        or os.environ.get("ANTHROPIC_AUTH_TOKEN")
    )


def configured() -> bool:
    return bool(_gemini_key() or _openai_key()) or _anthropic_configured()


def _client() -> anthropic.Anthropic:
    # 60s is ample for one image; the default of 10 minutes would hang the form.
    if settings.anthropic_api_key:
        return anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=60.0)
    return anthropic.Anthropic(timeout=60.0)


def _parse(text: str | None) -> ImageVerdict:
    if not text:
        raise VerifierError("The photo check returned no verdict.")
    try:
        return ImageVerdict.model_validate(json.loads(text))
    except ValueError as e:
        raise VerifierError("The photo check returned an unreadable verdict.") from e


def analyze(image: bytes, media_type: str, claimed_type: str, note: str | None) -> ImageVerdict:
    """Returns the model's verdict on the photo. Raises VerifierNotConfigured or VerifierError."""
    claim = f"The reporter says this is: {claimed_type}."
    if note:
        claim += f' Their note: "{note}"'

    if _gemini_key():
        return _analyze_gemini(image, media_type, claim)
    if _openai_key():
        return _analyze_openai(image, media_type, claim)
    if _anthropic_configured():
        return _analyze_claude(image, media_type, claim)
    raise VerifierNotConfigured()


# Tried in order when a model is overloaded (Gemini returns 503 under high demand).
GEMINI_FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]


def _analyze_gemini(image: bytes, media_type: str, claim: str) -> ImageVerdict:
    # Timeout is in milliseconds, per model tried; the whole list stays under
    # the browser's 90s limit.
    client = genai.Client(
        api_key=_gemini_key(), http_options=genai_types.HttpOptions(timeout=25_000)
    )
    models = [settings.gemini_image_check_model] + [
        m for m in GEMINI_FALLBACK_MODELS if m != settings.gemini_image_check_model
    ]
    config = genai_types.GenerateContentConfig(
        system_instruction=SYSTEM,
        temperature=0,
        response_mime_type="application/json",
        response_json_schema=VERDICT_SCHEMA,
    )
    contents = [genai_types.Part.from_bytes(data=image, mime_type=media_type), claim]

    for i, model in enumerate(models):
        last = i == len(models) - 1
        try:
            response = client.models.generate_content(
                model=model, contents=contents, config=config
            )
        except genai_errors.ClientError as e:
            code = getattr(e, "code", None)
            if code in (401, 403) or "API key" in str(e):
                raise VerifierError("The Gemini API key was rejected.") from e
            if code in (404, 429) and not last:
                continue  # model retired for this key, or its quota is used up
            if code == 429:
                raise VerifierError(
                    "The photo check is busy, or the Gemini quota is used up. "
                    "Please try again in a moment."
                ) from e
            raise VerifierError(f"The photo could not be read ({code}).") from e
        except genai_errors.APIError as e:
            if not last:
                continue  # overloaded (503) or server error: try the next model
            raise VerifierError(
                "The photo check is overloaded right now. Please try again in a moment."
            ) from e
        except (httpx.HTTPError, OSError, TimeoutError) as e:
            if not last:
                continue  # timed out or dropped: try the next model
            raise VerifierError(
                "The photo check service could not be reached. Please try again in a moment."
            ) from e

        if response.prompt_feedback and response.prompt_feedback.block_reason:
            raise VerifierError("The photo check declined to review this image.")
        return _parse(response.text)

    raise VerifierError("The photo check failed. Please try again in a moment.")


def _analyze_openai(image: bytes, media_type: str, claim: str) -> ImageVerdict:
    # 60s is ample for one image and keeps the form from hanging.
    client = openai.OpenAI(api_key=_openai_key(), timeout=60.0, max_retries=1)
    data_url = f"data:{media_type};base64,{base64.standard_b64encode(image).decode('ascii')}"
    try:
        response = client.chat.completions.create(
            model=settings.openai_image_check_model,
            max_tokens=500,
            temperature=0,
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "photo_verdict", "strict": True, "schema": VERDICT_SCHEMA},
            },
            messages=[
                {"role": "system", "content": SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
                        {"type": "text", "text": claim},
                    ],
                },
            ],
        )
    except openai.AuthenticationError as e:
        raise VerifierError("The OpenAI API key was rejected.") from e
    except openai.RateLimitError as e:
        if e.code in ("insufficient_quota", "credit_balance_exhausted"):
            raise VerifierError(
                "Photo checking is unavailable: the OpenAI account has no credits left."
            ) from e
        raise VerifierError("The photo check is busy right now. Please try again in a moment.") from e
    except openai.BadRequestError as e:
        raise VerifierError(f"The photo could not be read: {e.message}") from e
    except openai.APIStatusError as e:
        raise VerifierError(f"The photo check failed ({e.status_code}). Please try again in a moment.") from e
    except openai.APIConnectionError as e:
        raise VerifierError("The photo check service could not be reached. Please try again in a moment.") from e

    choice = response.choices[0]
    if choice.message.refusal:
        raise VerifierError("The photo check declined to review this image.")
    if choice.finish_reason == "length":
        raise VerifierError("The photo check did not finish.")
    return _parse(choice.message.content)


def _analyze_claude(image: bytes, media_type: str, claim: str) -> ImageVerdict:
    try:
        response = _client().beta.messages.create(
            model=settings.image_check_model,
            max_tokens=2000,
            system=SYSTEM,
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": VERDICT_SCHEMA},
            },
            # If the model declines the image, let the API retry on its default fallback.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": base64.standard_b64encode(image).decode("ascii"),
                            },
                        },
                        {"type": "text", "text": claim},
                    ],
                }
            ],
        )
    except anthropic.AuthenticationError as e:
        raise VerifierError("The Anthropic API key was rejected.") from e
    except anthropic.RateLimitError as e:
        raise VerifierError("The photo check is busy right now. Please try again in a moment.") from e
    except anthropic.BadRequestError as e:
        raise VerifierError(f"The photo could not be read: {e.message}") from e
    except anthropic.APIStatusError as e:
        raise VerifierError(f"The photo check failed ({e.status_code}). Please try again in a moment.") from e
    except anthropic.APIConnectionError as e:
        raise VerifierError("The photo check service could not be reached. Please try again in a moment.") from e

    if response.stop_reason == "refusal":
        raise VerifierError("The photo check declined to review this image.")
    if response.stop_reason == "max_tokens":
        raise VerifierError("The photo check did not finish.")

    return _parse(next((block.text for block in response.content if block.type == "text"), None))
