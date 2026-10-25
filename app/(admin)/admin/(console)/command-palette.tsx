"use client";

import { ArrowRightIcon, MagnifyingGlassIcon, UserIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, m } from "motion/react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { EASE_OUT } from "@/components/motion/easing";
import { adminHref } from "@/lib/admin-host";
import { NAV_ITEMS } from "../nav-config";
import { SearchButton } from "./chrome";
import { searchCreatorsQuick, type CreatorHit } from "./palette-actions";

type Option = { id: string; group: string; label: string; detail?: string; href: Route; Icon: typeof ArrowRightIcon };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ⌘K / Ctrl+K: jump to any page this admin can open, find a creator by handle or email, or open
 * a record by pasting its id. Arrow keys move, Enter opens, Esc closes.
 */
export function CommandPalette({ allowed, canSearchCreators, canSeePayments, canSeePayouts }: { allowed: Route[]; canSearchCreators: boolean; canSeePayments: boolean; canSeePayouts: boolean }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <SearchButton onOpen={show} />
      <AnimatePresence>
        {open ? (
          <Dialog
            onClose={() => setOpen(false)}
            allowed={allowed}
            canSearchCreators={canSearchCreators}
            canSeePayments={canSeePayments}
            canSeePayouts={canSeePayouts}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Dialog({ onClose, allowed, canSearchCreators, canSeePayments, canSeePayouts }: { onClose: () => void; allowed: Route[]; canSearchCreators: boolean; canSeePayments: boolean; canSeePayouts: boolean }) {
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<Element | null>(null);
  const [query, setQuery] = useState("");
  const [creators, setCreators] = useState<CreatorHit[]>([]);
  const [searched, setSearched] = useState("");
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  useEffect(() => {
    returnTo.current = document.activeElement;
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  // Debounced creator search; a newer query replaces an older answer.
  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (!canSearchCreators || q.length < 2 || UUID.test(q)) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        const hits = await searchCreatorsQuick(q);
        // Answers can arrive out of order: keep only the one for what's typed now.
        if (latest.current !== q) return;
        setCreators(hits);
        setSearched(q);
      });
    }, 220);
    return () => clearTimeout(t);
  }, [query, canSearchCreators]);

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const set = new Set<string>(allowed);
    const pages = NAV_ITEMS.filter((i) => set.has(i.href))
      .filter((i) => !q || i.label.toLowerCase().includes(q) || i.keywords?.includes(q))
      .map((i) => ({ id: `page-${i.href}`, group: "Pages", label: i.label, href: i.href, Icon: i.Icon }));
    const ids: Option[] = [];
    if (UUID.test(q)) {
      if (canSeePayments) ids.push({ id: "id-payment", group: "Open by id", label: "Transaction", detail: q, href: `/admin/transactions/${q}` as Route, Icon: ArrowRightIcon });
      if (canSeePayouts) ids.push({ id: "id-payout", group: "Open by id", label: "Withdrawal", detail: q, href: `/admin/payouts/${q}` as Route, Icon: ArrowRightIcon });
      if (canSearchCreators) ids.push({ id: "id-creator", group: "Open by id", label: "Creator", detail: q, href: `/admin/creators/${q}` as Route, Icon: ArrowRightIcon });
    }
    const people =
      searched === query.trim() && q.length >= 2
        ? creators.map((c) => ({ id: `creator-${c.userId}`, group: "Creators", label: c.label, detail: c.detail, href: `/admin/creators/${c.userId}` as Route, Icon: UserIcon }))
        : [];
    return [...ids, ...people, ...pages];
  }, [query, allowed, creators, searched, canSearchCreators, canSeePayments, canSeePayouts]);

  const selected = Math.min(index, Math.max(options.length - 1, 0));
  const go = (o: Option | undefined) => {
    if (!o) return;
    onClose();
    router.push(adminHref(o.href));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((selected + 1) % Math.max(options.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((selected - 1 + options.length) % Math.max(options.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(options[selected]);
    }
  };

  let lastGroup = "";
  const optionId = (o: Option) => `${listId}-${o.id}`;
  const q = query.trim();

  return (
    <div className="fixed inset-0 z-50" role="presentation" onKeyDown={onKeyDown}>
      <m.div className="absolute inset-0 bg-accent/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={onClose} />
      <m.div
        role="dialog"
        aria-modal="true"
        aria-label="Find a creator or page"
        className="absolute inset-x-3 top-[10vh] mx-auto flex max-h-[70vh] max-w-xl flex-col overflow-hidden rounded-brand bg-surface shadow-lift ring-1 ring-border"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.18, ease: EASE_OUT }}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <MagnifyingGlassIcon aria-hidden="true" className="size-4 shrink-0 text-muted" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={options[selected] ? optionId(options[selected]) : undefined}
            aria-autocomplete="list"
            placeholder={canSearchCreators ? "Handle, email, id or page name" : "Page name"}
            className="min-h-12 flex-1 bg-transparent text-[0.9375rem] !outline-none placeholder:text-muted"
          />
          {pending ? <span className="text-xs text-muted">Searching…</span> : null}
          <kbd className="rounded border border-border bg-surface-muted px-1.5 text-[0.6875rem] font-medium text-muted">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="flex-1 overflow-y-auto p-1.5">
          {options.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted" role="presentation">
              {q.length >= 2 && canSearchCreators && !pending ? `Nothing matches "${q}".` : "No pages match."}
            </li>
          ) : null}
          {options.map((o, i) => {
            const heading = o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            const active = i === selected;
            return (
              <li key={o.id} role="presentation">
                {heading ? (
                  <p role="presentation" className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted">
                    {heading}
                  </p>
                ) : null}
                <div
                  id={optionId(o)}
                  role="option"
                  aria-selected={active}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => go(o)}
                  className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-brand-sm px-2.5 text-sm ${active ? "bg-surface-muted text-text" : "text-text"}`}
                >
                  <o.Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
                  <span className="truncate font-medium">{o.label}</span>
                  {o.detail ? <span className="truncate text-xs text-muted">{o.detail}</span> : null}
                  {active ? <ArrowRightIcon aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-muted" /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </m.div>
    </div>
  );
}
