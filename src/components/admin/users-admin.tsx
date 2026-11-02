import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, MailPlus, ShieldCheck, User, Download } from "lucide-react";
import { toast } from "sonner";
import { useMe, type Role } from "@/hooks/use-me";
import { apiDownload, apiGet, apiSend } from "@/lib/api-client";
import { fmtDate, fmtStamp } from "@/lib/format";
import { selectClass } from "@/components/works/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { IconBubble } from "@/components/kpi";

type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  roles: Role[];
  mfa: boolean;
  last_sign_in_at: string | null;
  invited_at: string | null;
  confirmed: boolean;
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
  equipe: "Equipe de obra",
};
const ROLES = Object.keys(ROLE_LABEL) as Role[];

/** Gestão de usuários pela API própria: convites, papéis, 2FA e backup. */
export function UsersAdmin() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiGet<{ users: AdminUser[] }>("/v1/admin/users").then((r) => r.users),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const setRoles = useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: Role[] }) =>
      apiSend("PUT", `/v1/admin/users/${id}/roles`, { roles }),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("equipe");
  const invite = useMutation({
    mutationFn: () =>
      apiSend("POST", "/v1/admin/invites", { email, role, ...(name ? { full_name: name } : {}) }),
    onSuccess: () => {
      toast.success(`Convite enviado para ${email}.`);
      setEmail("");
      setName("");
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [exporting, setExporting] = useState(false);
  async function exportBackup() {
    setExporting(true);
    try {
      await apiDownload("/v1/admin/export", "jmg-backup.json");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0 p-4 sm:p-5">
          <IconBubble icon={MailPlus} tone="brand" />
          <CardTitle>Convidar usuário</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
          <form
            className="grid gap-3 sm:grid-cols-[2fr_2fr_1.5fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="invite-email">E-mail</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-name">Nome</Label>
              <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <label className="space-y-1 text-sm">
              Perfil
              <select
                className={selectClass}
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? "Enviando…" : "Enviar convite"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            A pessoa recebe um e-mail para definir a senha e já entra com o perfil escolhido.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="divide-y divide-border/60 p-0">
          {users.isLoading && <ListSkeleton rows={3} className="rounded-none border-0" />}
          {users.error && (
            <p className="px-4 py-4 text-sm text-destructive sm:px-5">
              {(users.error as Error).message}
            </p>
          )}
          {users.data?.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
              <IconBubble icon={User} tone="neutral" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="min-w-0 break-words">{u.full_name || u.email}</span>
                  {u.mfa && (
                    <Badge variant="positive">
                      <ShieldCheck className="h-3.5 w-3.5" aria-label="2FA ativo" />
                      2FA
                    </Badge>
                  )}
                </div>
                <div className="break-all text-xs text-muted-foreground">
                  {u.email} ·{" "}
                  {u.last_sign_in_at
                    ? `último acesso ${fmtStamp(u.last_sign_in_at)}`
                    : u.invited_at && !u.confirmed
                      ? "convite pendente"
                      : "nunca acessou"}
                </div>
              </div>
              <div className="flex w-full flex-wrap gap-2 pl-12 sm:w-auto sm:pl-0">
                {ROLES.map((r) => (
                  <label
                    key={r}
                    className="flex min-h-9 items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={u.roles.includes(r)}
                      disabled={setRoles.isPending || (u.id === me?.id && r === "admin")}
                      onChange={(e) =>
                        setRoles.mutate({
                          id: u.id,
                          roles: e.target.checked
                            ? [...u.roles, r]
                            : u.roles.filter((x) => x !== r),
                        })
                      }
                    />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="px-4 py-4 text-xs text-muted-foreground sm:px-5">
            Administrador e financeiro veem custos, margens e orçamentos. A equipe de obra não tem
            acesso a esses dados — o bloqueio é aplicado no banco de dados.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex min-w-[14rem] flex-1 items-start gap-3">
            <IconBubble icon={DatabaseBackup} tone="neutral" />
            <div className="min-w-0">
              <p className="font-medium">Backup dos dados</p>
              <p className="text-xs text-muted-foreground">
                Baixa todas as tabelas em JSON. Arquivos anexos não entram; o backup completo do
                servidor está no guia de infraestrutura.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={exportBackup} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? "Gerando…" : "Exportar backup"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
