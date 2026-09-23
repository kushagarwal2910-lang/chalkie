import React from "react";

interface ChalkieIconProps {
  size?: number;
  className?: string;
  alt?: string;
}

export function ChalkieIcon({
  size = 32,
  className = "",
  alt = "Chalkie",
}: ChalkieIconProps) {
  return (
    <img
      src="/chalkie-icon.png"
      alt={alt}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 select-none object-contain ${className}`}
      loading="eager"
      decoding="async"
    />
  );
}
