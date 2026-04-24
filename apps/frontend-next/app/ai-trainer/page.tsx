import dynamic from "next/dynamic";
import type { Metadata } from "next";
import "./ai-trainer-globals.css";

const AiTrainerClient = dynamic(() => import("./ai-trainer-client"), { ssr: false });

export const metadata: Metadata = {
  title: "AI Trainer",
  description: "Pose-guided reps with voice coaching."
};

export default function AiTrainerPage() {
  return <AiTrainerClient />;
}
