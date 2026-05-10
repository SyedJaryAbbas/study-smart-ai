import logo from "@/assets/logo.png";

export function Logo({ size = 32, withWordmark = false }: { size?: number; withWordmark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <img
        src={logo}
        alt="StudyOwl logo"
        width={size}
        height={size}
        className="rounded-lg"
        style={{ width: size, height: size }}
      />
      {withWordmark && (
        <span className="font-display text-xl font-bold tracking-tight text-foreground">
          StudyOwl
        </span>
      )}
    </div>
  );
}
