import { cn } from "@/lib/utils";

/**
 * "Namma Bengaluru" lockup — a script word over the Kannada ಬೆಂಗಳೂರು wordmark,
 * set against overlapping colour circles. Drawn in markup rather than shipped as
 * an image so it stays sharp at any size and follows the active theme.
 *
 * Sized to sit beside the 40px CityFlow mark without outgrowing the 56px header.
 */
export function NammaBengaluru({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative inline-flex items-center px-5 py-1 select-none", className)}
      role="img"
      aria-label="Namma Bengaluru"
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        <i className="absolute left-0 top-1/2 size-11 -translate-y-1/2 rounded-full bg-[oklch(0.88_0.13_92)] opacity-55" />
        <i className="absolute left-[36%] -top-1 size-7 rounded-full bg-[oklch(0.6_0.2_355)] opacity-50" />
        <i className="absolute right-[16%] -bottom-1 size-6 rounded-full bg-[oklch(0.72_0.14_30)] opacity-50" />
        <i className="absolute right-0 top-1/2 size-5 -translate-y-1/2 rounded-full bg-[oklch(0.78_0.11_230)] opacity-55" />
      </span>
      <span className="relative flex flex-col items-center leading-none text-foreground">
        <span className="namma-script text-base leading-none lg:text-lg">Namma</span>
        <span className="namma-kannada -mt-1 text-[1.6rem] leading-tight lg:text-[1.85rem]">
          ಬೆಂಗಳೂರು
        </span>
      </span>
    </span>
  );
}
