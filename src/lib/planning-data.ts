import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type WorkTask = Database["public"]["Tables"]["work_tasks"]["Row"];
export type WorkIssue = Database["public"]["Tables"]["work_issues"]["Row"];
export type TaskDependency = Database["public"]["Tables"]["work_task_dependencies"]["Row"];

// Consulta única do Planejamento e das Pendências (operacional, sem valores: a equipe também lê).
export const planningOptions = queryOptions({
  queryKey: ["planning"],
  queryFn: async () => {
    const [t, d, i, w, s, p, m, r] = await Promise.all([
      supabase.from("work_tasks").select("*").order("planned_date").order("created_at"),
      supabase.from("work_task_dependencies").select("*"),
      supabase.from("work_issues").select("*").order("due_date").order("created_at"),
      supabase
        .from("work_registry")
        .select("id,name,status,address,deleted_at")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("work_stages")
        .select("id,work_id,name,progress,status,planned_start,planned_end,removed,sort")
        .eq("removed", false)
        .order("sort"),
      supabase
        .from("people")
        .select("id,name,kind,deleted_at")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("work_client_materials")
        .select("id,work_id,description,due_date,delivered")
        .eq("delivered", false),
      supabase
        .from("work_records")
        .select("id,work_id,kind,title,status,due_date")
        .eq("kind", "decisao"),
    ]);
    for (const x of [t, d, i, w, s, p, m, r]) if (x.error) throw x.error;
    const works = w.data ?? [];
    const ids = new Set(works.map((x) => x.id));
    const inWork = <T extends { work_id: string }>(rows: T[] | null) =>
      (rows ?? []).filter((x) => ids.has(x.work_id));
    return {
      tasks: inWork(t.data),
      deps: d.data ?? [],
      issues: inWork(i.data),
      works,
      stages: inWork(s.data),
      people: p.data ?? [],
      clientMaterials: inWork(m.data),
      records: inWork(r.data),
    };
  },
});

export type PlanningData = Awaited<ReturnType<NonNullable<typeof planningOptions.queryFn>>>;
