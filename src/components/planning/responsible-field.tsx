import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/works/fields";
import { capitalizeWordsProps } from "@/lib/text-case";

const KIND_LABEL: Record<string, string> = {
  prestador: "Prestadores",
  fornecedor: "Fornecedores",
  arquiteto: "Arquitetos",
  cliente: "Clientes",
  contato: "Contatos",
};

/** Responsável: pessoa do Cadastros (prestadores primeiro) ou um nome digitado livremente. */
export function ResponsibleField({
  people,
  personId,
  text,
  onChange,
  label = "Responsável",
  kinds = ["prestador", "fornecedor", "arquiteto", "contato", "cliente"],
}: {
  people: { id: string; name: string; kind: string }[];
  personId: string;
  text: string;
  onChange: (v: { personId: string; text: string }) => void;
  label?: string;
  kinds?: string[];
}) {
  const FREE = "__livre";
  const [free, setFree] = useState(!personId && !!text.trim());
  const mode = personId ? personId : free ? FREE : "";
  return (
    <div className="space-y-1 text-sm">
      <Label>{label}</Label>
      <select
        className={selectClass}
        value={mode}
        onChange={(e) => {
          const v = e.target.value;
          setFree(v === FREE);
          onChange({ personId: v === FREE ? "" : v, text: v === FREE ? text : "" });
        }}
      >
        <option value="">Sem responsável</option>
        <option value={FREE}>Digitar um nome…</option>
        {kinds.map((k) => {
          const list = people.filter((p) => p.kind === k);
          return list.length ? (
            <optgroup key={k} label={KIND_LABEL[k] ?? k}>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>
      {mode === FREE && (
        <Input
          aria-label="Nome do responsável"
          placeholder="Ex.: Equipe JMG"
          value={text}
          onChange={(e) => onChange({ personId: "", text: e.target.value })}
          {...capitalizeWordsProps}
        />
      )}
    </div>
  );
}
