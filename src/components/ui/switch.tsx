"use client";

import { Switch as S } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-transparent bg-line-strong transition-colors duration-200",
        "data-[state=checked]:bg-brand disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block h-[18px] w-[18px] translate-x-[1px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] data-[state=checked]:translate-x-[17px]" />
    </S.Root>
  );
}
