import { ICON_PATHS } from '../data/catalog';

interface InfraIconProps {
  iconKey: string;
  size?: number;
  color?: string;
  className?: string;
}

export function InfraIcon({ iconKey, size = 20, color = 'currentColor', className }: InfraIconProps) {
  const paths = ICON_PATHS[iconKey] ?? ICON_PATHS.server;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}
