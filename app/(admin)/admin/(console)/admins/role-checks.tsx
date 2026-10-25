/** Role checkboxes (inside an ActionForm). */
export function RoleChecks({ roles, checked }: { roles: { id: string; name: string; key: string }[]; checked: Set<string> }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-[0.8125rem] font-medium">Roles</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {roles.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="roleId" value={r.id} defaultChecked={checked.has(r.id)} className="size-4 accent-primary" />
            {r.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
