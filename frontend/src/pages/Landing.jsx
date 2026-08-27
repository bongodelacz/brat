import Navbar from "@/components/Navbar";
import Hero from "@/components/landing/Hero";
import Marquee from "@/components/landing/Marquee";
import Manifesto from "@/components/landing/Manifesto";
import Reviews from "@/components/landing/Reviews";
import Pricing from "@/components/landing/Pricing";
import Footer from "@/components/landing/Footer";

export default function Landing() {
  return (
    <div className="App bg-[#050505] text-white">
      <Navbar />
      <Hero />
      <Marquee inverted />
      <Pricing />
      <Manifesto />
      <Reviews />
      <Marquee />
      <Footer />
    </div>
  );
}
