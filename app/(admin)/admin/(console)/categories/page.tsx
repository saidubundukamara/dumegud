import { TagIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/admin/Badge";
import { EmptyRows } from "@/components/admin/DataTable";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Field } from "@/components/ui/Field";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ActionForm } from "@/app/(admin)/admin/action-form";
import { saveCategory } from "./actions";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <AdminPage title="Categories" description="Creators pick one for their page and each product. Hiding a category keeps it where it’s already used; it just can’t be picked any more." width="narrow">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Categories />
      </Suspense>
    </AdminPage>
  );
}

function Fields({ name = "", slug = "", position = 0, active = true }: { name?: string; slug?: string; position?: number; active?: boolean }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem]">
        <Field compact name="name" label="Name" defaultValue={name} required maxLength={60} autoComplete="off" />
        <Field compact name="slug" label="Slug" defaultValue={slug} maxLength={60} autoComplete="off" hint={slug ? undefined : "Made from the name if blank."} className="[&_input]:font-mono" />
        <Field compact name="position" label="Order" type="number" defaultValue={String(position)} min={0} max={999} />
      </div>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="active" defaultChecked={active} className="size-[1.125rem] accent-primary" />
        Creators can pick it
      </label>
    </>
  );
}

async function Categories() {
  const { actor } = await requirePermission("settings.view");
  const categories = await services.adminConfig.listCategories(actor);
  const editable = can(actor, "settings.manage");
  return (
    <div className="flex flex-col gap-6">
      {editable ? (
        <Section title="Add a category">
          <ActionForm action={saveCategory} hidden={{ id: "" }} label="Add category" variant="primary">
            <Fields position={categories.length ? Math.max(...categories.map((c) => c.position)) + 1 : 0} />
          </ActionForm>
        </Section>
      ) : null}
      <Section title={`${categories.length} ${categories.length === 1 ? "category" : "categories"}`} flush>
        {categories.length ? (
          <ul className="divide-y divide-border">
            {categories.map((c) => (
              <li key={c.id} className="px-4 py-4 sm:px-5">
                {editable ? (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="w-8 text-sm text-muted tabular-nums">{c.position}</span>
                      <span className="flex-1 font-medium">{c.name}</span>
                      {c.active ? null : <Badge>Hidden</Badge>}
                      <code className="hidden font-mono text-xs text-muted sm:inline">{c.slug}</code>
                      <span className="text-sm font-medium text-muted group-open:hidden">Edit</span>
                    </summary>
                    <div className="mt-4">
                      <ActionForm action={saveCategory} hidden={{ id: c.id }} label="Save">
                        <Fields name={c.name} slug={c.slug} position={c.position} active={c.active} />
                      </ActionForm>
                    </div>
                  </details>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-sm text-muted tabular-nums">{c.position}</span>
                    <span className="flex-1 font-medium">{c.name}</span>
                    {c.active ? null : <Badge>Hidden</Badge>}
                    <code className="font-mono text-xs text-muted">{c.slug}</code>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRows icon={TagIcon} title="No categories yet">
            Add the first one above.
          </EmptyRows>
        )}
      </Section>
    </div>
  );
}
