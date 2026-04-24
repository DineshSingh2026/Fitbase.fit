import dynamic from "next/dynamic";
import type { Metadata } from "next";
import "../coach-surfaces.css";

const NutritionClient = dynamic(() => import("./nutrition-client"), { ssr: false });

export const metadata: Metadata = {
  title: "Nutrition AI",
  description: "Log meals and macros with Fitbase Nutrition AI."
};

export default function NutritionPage() {
  return <NutritionClient />;
}
