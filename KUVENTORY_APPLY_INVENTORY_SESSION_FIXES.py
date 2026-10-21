#!/usr/bin/env python3
"""Apply focused KUVENTORY inventory/session regression fixes to a local checkout.

Run in dry-run mode first:
    python KUVENTORY_APPLY_INVENTORY_SESSION_FIXES.py /path/to/kuventory

Apply after review:
    python KUVENTORY_APPLY_INVENTORY_SESSION_FIXES.py /path/to/kuventory --apply

The script edits no files unless --apply is supplied. It verifies every expected
source fragment before writing any file and stores .before-kuventory-fix backups.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import sys
import re
from typing import Dict, List, Tuple

Replacement = Tuple[str, str, int, str]


def replace_exact(text: str, old: str, new: str, expected: int, label: str, path: str) -> str:
    count = text.count(old)
    if count != expected:
        raise RuntimeError(
            f"{path}: expected {expected} match(es) for {label}, found {count}. "
            "No files were written. Re-fetch the latest source and review the patch."
        )
    return text.replace(old, new)


def build_changes(root: Path) -> Dict[Path, str]:
    changes: Dict[Path, str] = {}

    def edit(rel: str, replacements: List[Replacement]) -> None:
        path = root / rel
        if not path.is_file():
            raise RuntimeError(f"Required file not found: {path}")
        text = path.read_text(encoding="utf-8")
        for old, new, expected, label in replacements:
            text = replace_exact(text, old, new, expected, label, rel)
        changes[path] = text

    # Add Stock: keep date-only strings for the SQL DATE RPC.
    edit("src/features/inventory/components/StockUpdateModal.tsx", [
        (
            "expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined ",
            "// A date input already returns YYYY-MM-DD; keep it as a PostgreSQL DATE.\n        expiryDate: expiryDate || undefined ",
            1,
            "StockUpdateModal expiry serialization",
        ),
    ])

    edit("src/features/inventory/api/index.ts", [
        (
            "  const safeQty = Number(params.quantity);\n",
            "  const safeQty = Number(params.quantity);\n"
            "  // Normalize legacy ISO date-times to the DATE expected by the database RPC.\n"
            "  const expiryDate = params.expiryDate?.slice(0, 10);\n",
            1,
            "addStock date normalization",
        ),
        (
            "  if (!params.expiryDate) {\n    throw new Error('An expiration date is mandatory when adding stock batches.');\n  }\n",
            "  if (!expiryDate || !/^\\d{4}-\\d{2}-\\d{2}$/.test(expiryDate)) {\n"
            "    throw new Error('An expiration date is mandatory when adding stock batches.');\n"
            "  }\n"
            "  const parsedExpiry = new Date(`${expiryDate}T00:00:00Z`);\n"
            "  if (Number.isNaN(parsedExpiry.getTime()) || parsedExpiry.toISOString().slice(0, 10) !== expiryDate) {\n"
            "    throw new Error('Expiration date is invalid. Please select a valid date.');\n"
            "  }\n",
            1,
            "addStock date validation",
        ),
        (
            "  if (params.expiryDate < businessDate) {",
            "  if (expiryDate < businessDate) {",
            1,
            "addStock business-date comparison",
        ),
        (
            "    p_expiry_date: params.expiryDate,",
            "    p_expiry_date: expiryDate,",
            1,
            "addStock DATE RPC parameter",
        ),
        (
            "  if (rpcErr) {\n"
            "    console.error('create_inventory_item_with_initial_stock RPC error:', rpcErr);\n"
            "    throw new Error(rpcErr.message || 'Failed to create inventory item atomically.');\n"
            "  }\n",
            "  if (rpcErr) {\n"
            "    console.error('create_inventory_item_with_initial_stock RPC error:', rpcErr);\n"
            "    const message = rpcErr.message || 'Failed to create inventory item atomically.';\n"
            "    const lowerMessage = message.toLowerCase();\n"
            "    if (rpcErr.code === 'PGRST202' ||\n"
            "        (lowerMessage.includes('create_inventory_item_with_initial_stock') &&\n"
            "          (lowerMessage.includes('schema cache') || lowerMessage.includes('not found')))) {\n"
            "      throw new Error('The database does not expose the atomic Add Item function yet. No item was saved. Apply the Supabase migration 20261021210000_atomic_create_item_and_initial_stock.sql, then retry.');\n"
            "    }\n"
            "    throw new Error(message);\n"
            "  }\n",
            1,
            "actionable missing Add Item RPC message",
        ),
    ])

    # Catalog creation: never close the modal in finally and never fall back to
    # item-only creation when the mandatory opening stock/expiry were omitted.
    edit("src/features/inventory/pages/ItemsCatalogPage.tsx", [
        (
            "  const { createItemWithStock, createItem } = useCreateItem();",
            "  const { createItemWithStock } = useCreateItem();",
            1,
            "remove unsafe catalog create fallback",
        ),
        (
            "  const handleCreateOrUpdate = async (\n"
            "    data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>,\n"
            "    initialQty?: number,\n"
            "    initialExpiryDate?: string\n"
            "  ) => {\n"
            "    setIsSubmitting(true);\n"
            "    try {\n"
            "      if (editingItem) {\n"
            "        await updateItem({ id: editingItem.id, ...data });\n"
            "      } else {\n"
            "        if (initialQty && initialQty > 0 && initialExpiryDate) {\n"
            "          await createItemWithStock({\n"
            "            item_name: data.item_name,\n"
            "            category_id: data.category_id,\n"
            "            unit: data.unit,\n"
            "            initial_quantity: initialQty,\n"
            "            expiry_date: initialExpiryDate,\n"
            "            item_code: data.item_code,\n"
            "            description: data.description || '',\n"
            "            unit_cost: data.unit_cost,\n"
            "            min_quantity: data.min_qty,\n"
            "            supplier_a: data.supplier_a || '',\n"
            "            supplier_b: data.supplier_b || '',\n"
            "            image_path: data.image_path,\n"
            "          });\n"
            "        } else {\n"
            "          await createItem(data);\n"
            "        }\n"
            "      }\n"
            "    } finally {\n"
            "      setIsSubmitting(false);\n"
            "      setIsModalOpen(false);\n"
            "    }\n"
            "  };",
            "  const handleCreateOrUpdate = async (\n"
            "    data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>,\n"
            "    initialQty?: number,\n"
            "    initialExpiryDate?: string\n"
            "  ) => {\n"
            "    setIsSubmitting(true);\n"
            "    try {\n"
            "      if (editingItem) {\n"
            "        await updateItem({ id: editingItem.id, ...data });\n"
            "      } else {\n"
            "        const quantity = Number(initialQty);\n"
            "        const expiryDate = initialExpiryDate?.slice(0, 10);\n"
            "        if (!Number.isFinite(quantity) || quantity <= 0) {\n"
            "          throw new Error('Opening stock must be greater than zero. No item was created.');\n"
            "        }\n"
            "        if (!expiryDate) {\n"
            "          throw new Error('An expiration date is required. No item was created.');\n"
            "        }\n"
            "        await createItemWithStock({\n"
            "          item_name: data.item_name,\n"
            "          category_id: data.category_id,\n"
            "          unit: data.unit,\n"
            "          initial_quantity: quantity,\n"
            "          expiry_date: expiryDate,\n"
            "          item_code: data.item_code,\n"
            "          description: data.description || '',\n"
            "          unit_cost: data.unit_cost,\n"
            "          min_quantity: data.min_qty,\n"
            "          supplier_a: data.supplier_a || '',\n"
            "          supplier_b: data.supplier_b || '',\n"
            "          image_path: data.image_path,\n"
            "        });\n"
            "      }\n"
            "      setIsModalOpen(false);\n"
            "    } finally {\n"
            "      setIsSubmitting(false);\n"
            "    }\n"
            "  };",
            1,
            "catalog save modal/error handling",
        ),
    ])

    # AppLayout item dialog.
    edit("src/components/layout/AppLayout.tsx", [
        (
            "  const { createItemWithStock, createItem } = useCreateItem();",
            "  const { createItemWithStock } = useCreateItem();",
            1,
            "remove layout create fallback",
        ),
        (
            "    try {\n"
            "      if (initialQty && initialQty > 0 && initialExpiryDate) {\n"
            "        await createItemWithStock({\n"
            "          item_name: data.item_name,\n"
            "          category_id: data.category_id,\n"
            "          unit: data.unit,\n"
            "          initial_quantity: initialQty,\n"
            "          expiry_date: initialExpiryDate,\n"
            "          item_code: data.item_code,\n"
            "          description: data.description || '',\n"
            "          unit_cost: data.unit_cost,\n"
            "          min_quantity: data.min_qty,\n"
            "          supplier_a: data.supplier_a || '',\n"
            "          supplier_b: data.supplier_b || '',\n"
            "          image_path: data.image_path,\n"
            "        });\n"
            "      } else {\n"
            "        await createItem(data);\n"
            "      }\n"
            "      setIsNewItemModalOpen(false);\n",
            "    try {\n"
            "      const quantity = Number(initialQty);\n"
            "      const expiryDate = initialExpiryDate?.slice(0, 10);\n"
            "      if (!Number.isFinite(quantity) || quantity <= 0) {\n"
            "        throw new Error('Opening stock must be greater than zero. No item was created.');\n"
            "      }\n"
            "      if (!expiryDate) {\n"
            "        throw new Error('An expiration date is required. No item was created.');\n"
            "      }\n"
            "      await createItemWithStock({\n"
            "        item_name: data.item_name,\n"
            "        category_id: data.category_id,\n"
            "        unit: data.unit,\n"
            "        initial_quantity: quantity,\n"
            "        expiry_date: expiryDate,\n"
            "        item_code: data.item_code,\n"
            "        description: data.description || '',\n"
            "        unit_cost: data.unit_cost,\n"
            "        min_quantity: data.min_qty,\n"
            "        supplier_a: data.supplier_a || '',\n"
            "        supplier_b: data.supplier_b || '',\n"
            "        image_path: data.image_path,\n"
            "      });\n"
            "      setIsNewItemModalOpen(false);\n",
            1,
            "layout required opening stock",
        ),
    ])

    # Daily inventory station item dialog.
    edit("src/features/daily-inventory/components/InventorySheet.tsx", [
        (
            "  const { createItemWithStock, createItem } = useCreateItem();",
            "  const { createItemWithStock } = useCreateItem();",
            1,
            "remove station create fallback",
        ),
        (
            "      if (initialQty && initialQty > 0 && initialExpiryDate) {\n"
            "        await createItemWithStock({\n"
            "          item_name: data.item_name,\n"
            "          category_id: data.category_id,\n"
            "          unit: data.unit,\n"
            "          initial_quantity: initialQty,\n"
            "          expiry_date: initialExpiryDate,\n"
            "          item_code: data.item_code,\n"
            "          description: data.description || '',\n"
            "          unit_cost: data.unit_cost,\n"
            "          min_quantity: data.min_qty,\n"
            "          supplier_a: data.supplier_a || '',\n"
            "          supplier_b: data.supplier_b || '',\n"
            "          image_path: data.image_path,\n"
            "        });\n"
            "      } else {\n"
            "        await createItem(data);\n"
            "      }\n",
            "      const quantity = Number(initialQty);\n"
            "      const expiryDate = initialExpiryDate?.slice(0, 10);\n"
            "      if (!Number.isFinite(quantity) || quantity <= 0) {\n"
            "        throw new Error('Opening stock must be greater than zero. No item was created.');\n"
            "      }\n"
            "      if (!expiryDate) {\n"
            "        throw new Error('An expiration date is required. No item was created.');\n"
            "      }\n"
            "      await createItemWithStock({\n"
            "        item_name: data.item_name,\n"
            "        category_id: data.category_id,\n"
            "        unit: data.unit,\n"
            "        initial_quantity: quantity,\n"
            "        expiry_date: expiryDate,\n"
            "        item_code: data.item_code,\n"
            "        description: data.description || '',\n"
            "        unit_cost: data.unit_cost,\n"
            "        min_quantity: data.min_qty,\n"
            "        supplier_a: data.supplier_a || '',\n"
            "        supplier_b: data.supplier_b || '',\n"
            "        image_path: data.image_path,\n"
            "      });\n",
            1,
            "station required opening stock",
        ),
    ])

    # Stable browser-wide session ID; the old ID is reused on the first load.
    edit("src/features/auth/services/sessionLeaseService.ts", [
        (
            "export function getOrCreateClientId(): string {\n"
            "  try {\n"
            "    let clientId = sessionStorage.getItem(CLIENT_ID_KEY);\n"
            "    if (!clientId) {\n"
            "      clientId = 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);\n"
            "      sessionStorage.setItem(CLIENT_ID_KEY, clientId);\n"
            "    }\n"
            "    return clientId;\n"
            "  } catch {\n"
            "    return 'client_' + Math.random().toString(36).substring(2, 11);\n"
            "  }\n"
            "}",
            "export function getOrCreateClientId(): string {\n"
            "  try {\n"
            "    // sessionStorage is per-tab; localStorage shares a stable client ID\n"
            "    // across tabs in this browser so one account is not falsely marked busy.\n"
            "    let clientId = localStorage.getItem(CLIENT_ID_KEY);\n"
            "    if (!clientId) {\n"
            "      clientId = sessionStorage.getItem(CLIENT_ID_KEY) ||\n"
            "        ('client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36));\n"
            "      localStorage.setItem(CLIENT_ID_KEY, clientId);\n"
            "    }\n"
            "    sessionStorage.setItem(CLIENT_ID_KEY, clientId);\n"
            "    return clientId;\n"
            "  } catch {\n"
            "    try {\n"
            "      const existingId = sessionStorage.getItem(CLIENT_ID_KEY);\n"
            "      if (existingId) return existingId;\n"
            "      const fallbackId = 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);\n"
            "      sessionStorage.setItem(CLIENT_ID_KEY, fallbackId);\n"
            "      return fallbackId;\n"
            "    } catch {\n"
            "      return 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);\n"
            "    }\n"
            "  }\n"
            "}",
            1,
            "browser-scoped client ID",
        ),
        (
            "    const clientId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLIENT_ID_KEY) : null;\n",
            "    const stableClientId = typeof localStorage !== 'undefined' ? localStorage.getItem(CLIENT_ID_KEY) : null;\n"
            "    const legacyClientId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLIENT_ID_KEY) : null;\n"
            "    const clientId = stableClientId || legacyClientId;\n",
            1,
            "page-exit beacon reads stable client ID",
        ),
    ])

    # Browser marker: migrate the old tab-only marker and share it across tabs.
    auth_path = root / "src/features/auth/context/AuthContext.tsx"
    auth_text = auth_path.read_text(encoding="utf-8")
    auth_text = replace_exact(
        auth_text,
        "const isSessionActive = sessionStorage.getItem(BROWSER_SESSION_KEY);",
        "const isSessionActive = hasBrowserSessionMarker();",
        1,
        "initial active marker read",
        "src/features/auth/context/AuthContext.tsx",
    )
    auth_text = replace_exact(
        auth_text,
        "sessionStorage.removeItem(BROWSER_SESSION_KEY);",
        "setBrowserSessionMarker(false);",
        4,
        "clear all old browser marker sites",
        "src/features/auth/context/AuthContext.tsx",
    )
    auth_text = replace_exact(
        auth_text,
        "sessionStorage.setItem(BROWSER_SESSION_KEY, '1');",
        "setBrowserSessionMarker(true);",
        2,
        "set all old browser marker sites",
        "src/features/auth/context/AuthContext.tsx",
    )
    auth_text = replace_exact(
        auth_text,
        "    if (res.status === 'UNKNOWN') {\n"
        "      // Transient network or server error: grace period with fail-closed boundary\n"
        "      consecutiveFailuresRef.current += 1;\n"
        "      if (consecutiveFailuresRef.current < 3) {\n"
        "        setIsSessionVerifying(true);\n"
        "        console.warn(`Transient heartbeat verification failure (${consecutiveFailuresRef.current}/3). Retrying...`);\n"
        "      } else {\n"
        "        await handleTerminalState('Session security verification timed out. Please check your connection and sign in again.');\n"
        "      }\n"
        "    }",
        "    if (res.status === 'UNKNOWN') {\n"
        "      // A transport error is not proof of a conflicting session. Retry and\n"
        "      // let an authoritative EXPIRED / REVOKED / SUPERSEDED response decide.\n"
        "      consecutiveFailuresRef.current += 1;\n"
        "      setIsSessionVerifying(true);\n"
        "      console.warn(`Transient heartbeat verification failure (${consecutiveFailuresRef.current}). Retrying without terminating the session.`);\n"
        "    }",
        1,
        "transient heartbeat handling",
        "src/features/auth/context/AuthContext.tsx",
    )
    auth_text = replace_exact(
        auth_text,
        "        const hbResult = await heartbeatSessionLease();\n        if (hbResult.status !== 'ACTIVE') {",
        "        const hbResult = await heartbeatSessionLease();\n"
        "        if (hbResult.status === 'UNKNOWN') {\n"
        "          // Preserve the valid Supabase session while the lease endpoint is transiently unreachable.\n"
        "          // The normal heartbeat loop will retry and terminate on definitive lease failure.\n"
        "          if (isMounted) {\n"
        "            setIsSessionVerifying(true);\n"
        "            setSession(initSession);\n"
        "            setUser(initSession.user ?? null);\n"
        "            setIsSessionLoading(false);\n"
        "          }\n"
        "          return;\n"
        "        }\n"
        "        if (hbResult.status !== 'ACTIVE') {",
        1,
        "initial heartbeat network handling",
        "src/features/auth/context/AuthContext.tsx",
    )
    helper = (
        "const BROWSER_SESSION_KEY = 'kuventory_browser_session_active';\n\n"
        "function hasBrowserSessionMarker(): boolean {\n"
        "  try {\n"
        "    if (localStorage.getItem(BROWSER_SESSION_KEY) === '1') return true;\n"
        "    // Upgrade a pre-existing per-tab marker on the first upgraded load.\n"
        "    if (sessionStorage.getItem(BROWSER_SESSION_KEY) === '1') {\n"
        "      localStorage.setItem(BROWSER_SESSION_KEY, '1');\n"
        "      return true;\n"
        "    }\n"
        "  } catch {\n"
        "    // Lease verification remains authoritative if browser storage is blocked.\n"
        "  }\n"
        "  return false;\n"
        "}\n\n"
        "function setBrowserSessionMarker(active: boolean): void {\n"
        "  try {\n"
        "    if (active) localStorage.setItem(BROWSER_SESSION_KEY, '1');\n"
        "    else localStorage.removeItem(BROWSER_SESSION_KEY);\n"
        "  } catch {}\n"
        "  try {\n"
        "    if (active) sessionStorage.setItem(BROWSER_SESSION_KEY, '1');\n"
        "    else sessionStorage.removeItem(BROWSER_SESSION_KEY);\n"
        "  } catch {}\n"
        "}\n"
    )
    auth_text = replace_exact(
        auth_text,
        "const BROWSER_SESSION_KEY = 'kuventory_browser_session_active';\n",
        helper,
        1,
        "insert migration-safe marker helpers",
        "src/features/auth/context/AuthContext.tsx",
    )
    changes[auth_path] = auth_text

    # Other marker writers/clearers must keep both keys in sync.
    login_path = root / "src/features/auth/components/LoginForm.tsx"
    login_text = login_path.read_text(encoding="utf-8")
    marker_line = re.compile(r"(?m)^(\s*)sessionStorage\.removeItem\('kuventory_browser_session_active'\);$")
    marker_count = len(marker_line.findall(login_text))
    if marker_count != 4:
        raise RuntimeError(
            f"src/features/auth/components/LoginForm.tsx: expected 4 marker removals, found {marker_count}. "
            "No files were written. Review latest source."
        )
    login_text = marker_line.sub(
        lambda match: f"{match.group(1)}localStorage.removeItem('kuventory_browser_session_active');\n"
                      f"{match.group(1)}sessionStorage.removeItem('kuventory_browser_session_active');",
        login_text,
    )
    changes[login_path] = login_text
    edit("src/features/auth/hooks/useLogoutPrompt.ts", [
        (
            "sessionStorage.removeItem('kuventory_browser_session_active');",
            "localStorage.removeItem('kuventory_browser_session_active');\n      sessionStorage.removeItem('kuventory_browser_session_active');",
            1,
            "logout clears browser marker from both storage areas",
        ),
    ])

    return changes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", type=Path, help="Path to a local KUVENTORY repository checkout")
    parser.add_argument("--apply", action="store_true", help="Write the changes; otherwise perform a safe dry run")
    args = parser.parse_args()
    root = args.repository.resolve()
    if not (root / ".git").exists():
        print(f"ERROR: {root} does not appear to be a Git checkout (.git missing).", file=sys.stderr)
        return 2

    try:
        changes = build_changes(root)
    except Exception as exc:
        print(f"DRY-RUN FAILED: {exc}", file=sys.stderr)
        return 1

    print(f"Validated {len(changes)} source files against the expected pre-fix code.")
    for path in changes:
        print(f"  {'WRITE' if args.apply else 'READY'} {path.relative_to(root)}")
    if not args.apply:
        print("\nNo changes written. Review the files and re-run with --apply to apply them.")
        return 0

    # All replacements are verified before any write is performed.
    for path, content in changes.items():
        backup = path.with_name(path.name + ".before-kuventory-fix")
        if not backup.exists():
            backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        path.write_text(content, encoding="utf-8", newline="")
    print("\nApplied changes. Original files were backed up with .before-kuventory-fix suffixes.")
    print("Run lint, typecheck, unit tests, build, and Playwright regressions before deploying.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
