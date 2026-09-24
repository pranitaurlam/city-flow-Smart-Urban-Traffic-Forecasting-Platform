import { createServerFn } from "@tanstack/react-start";

export type WeatherReading = {
  condition: string;
  tempC: number;
  humidity: number;
  windKph: number;
  chanceOfRain: number;
  tomorrow: { condition: string; tempC: number; chanceOfRain: number };
  live: boolean;
};

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 1000;
  }
  return hash;
}

export function mockWeatherReading(slug: string): WeatherReading {
  const seed = hashString(slug);
  const conditions = ["Partly Cloudy", "Clear", "Overcast", "Light Rain", "Humid"];
  const condition = conditions[seed % conditions.length] ?? "Partly Cloudy";
  const tempC = 24 + (seed % 7);
  return {
    condition,
    tempC,
    humidity: 55 + (seed % 25),
    windKph: 8 + (seed % 14),
    chanceOfRain: condition === "Light Rain" ? 65 : 15 + (seed % 20),
    tomorrow: {
      condition: conditions[(seed + 1) % conditions.length] ?? "Partly Cloudy",
      tempC: tempC + (seed % 3) - 1,
      chanceOfRain: 20 + (seed % 30),
    },
    live: false,
  };
}

export const getLiveWeather = createServerFn({ method: "GET" })
  .validator((data: { lat: number; lon: number; slug: string }) => data)
  .handler(async ({ data }): Promise<WeatherReading> => {
    const apiKey = process.env["WEATHERAPI_KEY"];
    if (!apiKey) return mockWeatherReading(data.slug);

    const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${data.lat},${data.lon}&days=2&aqi=no&alerts=no`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return mockWeatherReading(data.slug);
      const json = (await res.json()) as {
        current?: {
          temp_c?: number;
          condition?: { text?: string };
          humidity?: number;
          wind_kph?: number;
        };
        forecast?: {
          forecastday?: {
            day?: {
              avgtemp_c?: number;
              condition?: { text?: string };
              daily_chance_of_rain?: number;
            };
          }[];
        };
      };
      const current = json.current;
      const tomorrow = json.forecast?.forecastday?.[1]?.day;
      if (!current || current.temp_c === undefined) return mockWeatherReading(data.slug);
      return {
        condition: current.condition?.text ?? "Clear",
        tempC: Math.round(current.temp_c),
        humidity: current.humidity ?? 60,
        windKph: Math.round(current.wind_kph ?? 10),
        chanceOfRain: json.forecast?.forecastday?.[0]?.day?.daily_chance_of_rain ?? 20,
        tomorrow: {
          condition: tomorrow?.condition?.text ?? "Clear",
          tempC: Math.round(tomorrow?.avgtemp_c ?? current.temp_c),
          chanceOfRain: tomorrow?.daily_chance_of_rain ?? 20,
        },
        live: true,
      };
    } catch {
      return mockWeatherReading(data.slug);
    } finally {
      clearTimeout(timeout);
    }
  });
