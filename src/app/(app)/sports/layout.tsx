import SlipProvider from "@/components/sports/SlipProvider";
import SportsFrame from "@/components/sports/SportsFrame";

export default function SportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SlipProvider>
      <SportsFrame>{children}</SportsFrame>
    </SlipProvider>
  );
}
