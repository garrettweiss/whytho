import { Anton, Public_Sans } from "next/font/google";

export const faceDisplay = Anton({ weight: "400", subsets: ["latin"], variable: "--font-face-display", display: "swap" });
export const faceBody = Public_Sans({ subsets: ["latin"], variable: "--font-face-body", display: "swap" });
