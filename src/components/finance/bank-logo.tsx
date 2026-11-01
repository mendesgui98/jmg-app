import { useState } from "react";
import { Landmark, Wallet } from "lucide-react";
import { bankLogo } from "@/lib/bank-logos";
import { IconBubble } from "@/components/kpi";
import { cn } from "@/lib/utils";

/** Logo do banco da conta (pelo nome do banco); sem logo conhecida, o ícone de banco/caixa. */
export function BankLogo({
  account,
  className,
}: {
  account: { bank?: string | null; name?: string | null; kind?: string | null };
  className?: string;
}) {
  const src = bankLogo(account);
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <IconBubble
        icon={account.kind === "caixa" ? Wallet : Landmark}
        tone={account.kind === "caixa" ? "positive" : "brand"}
        className={className ?? ""}
      />
    );
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white p-1",
        className,
      )}
    >
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
