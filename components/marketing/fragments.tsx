import {
  ArrowUpRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  InstagramLogoIcon,
  LinkSimpleIcon,
  TiktokLogoIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react/dist/ssr";

// Small pieces of the real product, drawn for the marketing pages. All decorative: the amounts
// are examples, and the real screens they imitate live in the app.

const SURFACE = "rounded-2xl bg-surface shadow-lift ring-1 ring-border";

function Initial({ name, tone = "primary" }: { name: string; tone?: "primary" | "muted" }) {
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        tone === "primary" ? "bg-primary text-primary-foreground" : "bg-surface-muted text-text"
      }`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** "Mohamed sent a Le 50 gift". `dim` fades it back for the stacked hero list. */
export function GiftNotice({ name, amount, note, dim = false, className = "w-60" }: { name: string; amount: string; note?: string; dim?: boolean; className?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-center gap-3 p-2.5 pr-4 ${SURFACE} ${dim ? "scale-90 opacity-45 blur-[0.5px]" : ""} ${className}`}>
      <Initial name={name} tone={dim ? "muted" : "primary"} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {name} sent a <span className="whitespace-nowrap">{amount} gift</span>
        </p>
        {note ? <p className="truncate text-xs text-muted">{note}</p> : null}
      </div>
    </div>
  );
}

export function WalletCard({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex w-60 flex-col gap-3 p-4 ${SURFACE} ${className}`}>
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        Your wallet
        <span className="rounded-full bg-success-surface px-2 py-0.5 font-semibold text-success">Ready</span>
      </div>
      <p className="text-3xl font-semibold tracking-[-0.03em] tabular-nums">Le 1,240.50</p>
      <span className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        Withdraw to Orange Money
      </span>
    </div>
  );
}

export function SaleChip({ title = "Beat pack sold", line = "Le 150, file sent", className = "" }: { title?: string; line?: string; className?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-center gap-3 p-2.5 pr-4 ${SURFACE} ${className}`}>
      <span className="flex size-9 items-center justify-center rounded-full bg-secondary-soft text-secondary-foreground">
        <DownloadSimpleIcon weight="bold" className="size-4" />
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted">{line}</p>
      </div>
    </div>
  );
}

export function GiftList() {
  const gifts = [
    { name: "Fatmata", amount: "Le 100", note: "Your videos make me laugh every day" },
    { name: "Ibrahim", amount: "Le 50", note: "Keep going, bro!" },
    { name: "Mariama", amount: "Le 20", note: "Love the new song" },
  ];
  return (
    <ul aria-hidden="true" className={`flex flex-col divide-y divide-border px-4 ${SURFACE}`}>
      {gifts.map((g, i) => (
        <li key={g.name} className="flex items-center gap-3 py-3">
          <Initial name={g.name} tone={i === 0 ? "primary" : "muted"} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{g.name}</p>
            <p className="truncate text-xs text-muted">{g.note}</p>
          </div>
          <span className="text-sm font-semibold tabular-nums">{g.amount}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProductTile() {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-3 p-3 ${SURFACE}`}>
      <div className="flex aspect-[16/9] items-end rounded-xl bg-[linear-gradient(135deg,var(--color-primary),var(--color-primary-pressed))] p-3">
        <span className="text-lg font-semibold tracking-[-0.02em] text-primary-foreground">Freetown Beats, Vol. 2</span>
      </div>
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-sm font-semibold">Beat pack</p>
          <p className="text-xs text-muted">ZIP, 48 MB</p>
        </div>
        <span className="rounded-full bg-surface-muted px-3 py-1 text-sm font-semibold tabular-nums">Le 150</span>
      </div>
    </div>
  );
}

export function ShoutoutCard() {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-3 p-4 ${SURFACE}`}>
      <p className="text-sm leading-relaxed">
        Big thank you to <span className="font-semibold text-primary">@fatmata.sl</span> and{" "}
        <span className="font-semibold text-primary">@ibrahim_k</span> for the support this week!
      </p>
      <div className="flex gap-2">
        <span className="flex h-8 flex-1 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold">Copy caption</span>
        <span className="flex h-8 flex-1 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold">Save image</span>
      </div>
    </div>
  );
}

export function WithdrawCard() {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-3 p-4 ${SURFACE}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted">Withdraw</span>
        <span className="text-xs text-muted">Orange Money</span>
      </div>
      <p className="text-2xl font-semibold tracking-[-0.03em] tabular-nums">Le 500.00</p>
      <div className="flex items-center gap-2 rounded-xl bg-surface-muted p-2.5 text-sm">
        <span className="flex size-6 items-center justify-center rounded-full bg-success text-white">
          <CheckIcon weight="bold" className="size-3.5" />
        </span>
        Sent to your number ending 4821
      </div>
    </div>
  );
}

export function ShareCard() {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-4 p-4 ${SURFACE}`}>
      <div className="flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-sm font-medium">
        <LinkSimpleIcon className="size-4 text-muted" />
        dumegud.com/aminata
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
        {[
          { label: "WhatsApp", Icon: WhatsappLogoIcon },
          { label: "TikTok", Icon: TiktokLogoIcon },
          { label: "Instagram", Icon: InstagramLogoIcon },
        ].map(({ label, Icon }) => (
          <span key={label} className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-muted py-3">
            <Icon weight="fill" className="size-5" />
            {label}
          </span>
        ))}
      </div>
      <span className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        Share my page <ArrowUpRightIcon weight="bold" className="size-4" />
      </span>
    </div>
  );
}
