import { useState, useEffect } from 'react';
import { 
  ChevronUp, 
  ChevronDown, 
  FileSpreadsheet, 
  Layers, 
  ShieldCheck, 
  FileBarChart2, 
  Sparkles 
} from 'lucide-react';

interface Slide {
  id: string;
  tag: string;
  title: string;
  description: string;
  icon: any;
  highlight: string;
}

const SLIDES: Slide[] = [
  {
    id: 'worksheet',
    tag: 'DYNAMIC STATIONS',
    title: 'Daily Shift Worksheet',
    description: 'Digitize physical paper sheets across Grilled, Portion, Cases, and Beverage stations with instant AM/PM tracking.',
    icon: FileSpreadsheet,
    highlight: 'Real-Time Autosave Protection'
  },
  {
    id: 'fefo',
    tag: 'EXPIRATION ENGINE',
    title: 'Automated FEFO Rotation',
    description: 'First-Expired, First-Out consumption queue automatically prioritizes oldest lots to eliminate perishable food waste.',
    icon: Layers,
    highlight: 'Zero Spoilage Guarantee'
  },
  {
    id: 'contingency',
    tag: 'TIER 0 ROOT AUTHORITY',
    title: 'Master Admin Contingency Hub',
    description: 'Real-time system event monitor, 1-click full database snapshots, balance drift auto-healing, and emergency recovery.',
    icon: ShieldCheck,
    highlight: 'Live Real-Time Monitoring'
  },
  {
    id: 'reports',
    tag: 'AUDIT ACCURACY',
    title: 'Immutable Snapshots & Exports',
    description: 'Finalize shift counts into permanent audit snapshots with 1-click exports to PDF, Excel (.xlsx), and CSV.',
    icon: FileBarChart2,
    highlight: 'Tamper-Proof Ledger'
  }
];

export function LoginFeatureSlider() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % SLIDES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPaused]);

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % SLIDES.length);
  };

  return (
    <div 
      className="w-full max-w-sm rounded-2xl bg-[#2A201C]/80 border border-[#3E302A] p-5 shadow-xl relative overflow-hidden backdrop-blur-sm"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Header bar with tag & controls */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-1.5 text-[#D4AF37] font-bold tracking-wider text-[10px] uppercase">
          <Sparkles className="w-3 h-3 text-[#D4AF37]" />
          <span>SYSTEM HIGHLIGHT</span>
        </div>

        {/* Vertical Navigation Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous slide"
            className="p-1 rounded-md bg-[#1F1816] hover:bg-[#3E302A] text-[#A89E93] hover:text-[#FAF7F2] transition-colors cursor-pointer border border-[#3E302A]"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next slide"
            className="p-1 rounded-md bg-[#1F1816] hover:bg-[#3E302A] text-[#A89E93] hover:text-[#FAF7F2] transition-colors cursor-pointer border border-[#3E302A]"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Vertical Slider Window */}
      <div className="relative h-28 overflow-hidden">
        {SLIDES.map((slide, idx) => {
          const Icon = slide.icon;
          const offset = idx - activeIndex;

          return (
            <div
              key={slide.id}
              className="absolute inset-0 flex flex-col justify-between transition-all duration-500 ease-out"
              style={{
                transform: `translateY(${offset * 100}%)`,
                opacity: idx === activeIndex ? 1 : 0,
                pointerEvents: idx === activeIndex ? 'auto' : 'none'
              }}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#C5A059] block">
                    {slide.tag}
                  </span>
                  <h3 className="text-sm font-bold text-[#FAF7F2] leading-tight">
                    {slide.title}
                  </h3>
                  <p className="text-[11px] text-[#D5CEC5] line-clamp-2 mt-1 leading-normal">
                    {slide.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#3E302A]/80 text-[10px]">
                <span className="text-[#8C8075] font-medium">Feature {idx + 1} of {SLIDES.length}</span>
                <span className="px-2 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] font-semibold border border-[#D4AF37]/20">
                  {slide.highlight}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Vertical Progress Indicators on the right */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-none">
        {SLIDES.map((_, i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-300 ${
              i === activeIndex 
                ? 'h-4 bg-[#D4AF37]' 
                : 'h-1.5 bg-[#3E302A]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
