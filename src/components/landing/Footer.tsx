import EyesLogo from '../common/EyesLogo';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="w-full bg-[#0a0a0a] text-white py-2 border-t border-white/10">
      <div className="max-w-[1440px] mx-auto px-6 md:px-16 w-full">
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8 w-full">
          {/* Logo Section */}
          <div className="flex items-center gap-4 md:w-auto -ml-4 md:-ml-26">
            <div className="flex items-center gap-2">
              <div className="text-white w-[110px] md:w-[140px] h-[26px] md:h-[32px] flex items-center">
                <EyesLogo width="100%" height="100%" />
              </div>
              <div className="flex flex-col text-[8px] md:text-[9px] font-semibold leading-[1.0] text-neutral-400">
                <span className="pl-0">Everything</span>
                <span className="pl-0">You</span>
                <span className="pl-[0.75px]">Ever</span>
                <span className="pl-[0.75px]">Said</span>
              </div>
            </div>
          </div>

          {/* Middle: Links Section (TCS Style) */}
          <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left md:px-12 w-full">
            <span className="text-xs text-neutral-400 font-medium tracking-wide mb-4">
              © 2026 EYES. All rights reserved.
            </span>
            <div className="flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-3 text-[12px] font-medium text-neutral-300">
              <Link href="/privacy-policy" className="hover:text-white hover:underline transition-colors">Privacy Policy</Link>
              <Link href="/cookie-policy" className="hover:text-white hover:underline transition-colors">Cookie Policy</Link>
              <Link href="/security-policy" className="hover:text-white hover:underline transition-colors">Security Policy</Link>
              <Link href="/disclaimer" className="hover:text-white hover:underline transition-colors">Disclaimer</Link>
            </div>
          </div>

          {/* Social Icons Section */}
          <div className="flex items-center justify-center md:justify-end gap-5 text-neutral-400 md:w-auto mt-10 md:mt-6">
            {/* EYES Links pending... */}
          </div>
        </div>
      </div>
    </footer>
  );
}