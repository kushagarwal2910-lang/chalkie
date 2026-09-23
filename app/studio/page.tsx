import { ChalkieStudio } from "@/components/chalkie-studio";
import { Suspense } from "react";

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="h-dvh bg-[#090a0f]" />}>
      <ChalkieStudio />
    </Suspense>
  );
}
