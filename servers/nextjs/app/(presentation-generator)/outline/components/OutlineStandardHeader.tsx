"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface OutlineStandardHeaderProps {
  title: string;
  /** Sin `onBack` no hay botón: en el iframe de Brain no hay dashboard al que volver. */
  onBack?: () => void;
  embed?: boolean;
}

const logo = (
  <Image
    src="/logo-with-bg.png"
    alt=""
    width={32}
    height={33}
    className="h-[33px] w-[32px]"
  />
);

const OutlineStandardHeader = ({
  title,
  onBack,
  embed = false,
}: OutlineStandardHeaderProps) => (
  <header className="sticky top-0 z-[60] h-[68px] w-full border-b border-[#EDEEEF] bg-white font-syne">
    <div className="flex h-full items-center justify-between px-6">
      <div className="flex min-w-0 items-center gap-3">
        {embed ? (
          <span className="shrink-0">{logo}</span>
        ) : (
          <Link
            href="/dashboard"
            aria-label="Go to dashboard"
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/30"
          >
            {logo}
          </Link>
        )}
        <h1 className="truncate text-base font-medium tracking-[0.16px] text-[#101323]">
          {title}
        </h1>
      </div>

      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.96px] text-[#333333] transition-colors hover:text-[#7A5AF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/30"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
      ) : null}
    </div>
  </header>
);

export default OutlineStandardHeader;
