// Icônes de la discussion : décoratives, le nom accessible est porté par le bouton qui les contient.
type IconProps = { className?: string };

function Icon({ className = "h-5 w-5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export const ArrowUpIcon = (props: IconProps) => <Icon {...props}><path d="M12 19V5M5 12l7-7 7 7" /></Icon>;
export const StopIcon = (props: IconProps) => <Icon {...props}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></Icon>;
export const MicIcon = (props: IconProps) => <Icon {...props}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Icon>;
export const CopyIcon = (props: IconProps) => <Icon {...props}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Icon>;
export const CheckIcon = (props: IconProps) => <Icon {...props}><path d="M5 12l5 5 9-10" /></Icon>;
export const SpeakerIcon = (props: IconProps) => <Icon {...props}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></Icon>;
export const ChevronDownIcon = (props: IconProps) => <Icon {...props}><path d="M6 9l6 6 6-6" /></Icon>;
export const ExpandIcon = (props: IconProps) => <Icon {...props}><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></Icon>;
export const CollapseIcon = (props: IconProps) => <Icon {...props}><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M3 21l7-7" /></Icon>;
export const WaveIcon = (props: IconProps) => <Icon {...props}><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></Icon>;
