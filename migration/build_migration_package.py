#!/usr/bin/env python3
import argparse
import csv
import hashlib
import json
import os
import re
import shutil
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import unquote
from uuid import NAMESPACE_URL, uuid5


ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path("/Users/ivankliuchevski/Downloads")
EXPORTED_AT = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
PACKAGE_DIR = None
CUTOFF = date(2026, 6, 15)


SOURCE_FILES = {
    "inventory_samples": DOWNLOADS / "Supabase Snippet Untitled query.csv",
    "cash_log": DOWNLOADS / "Supabase Snippet Untitled query (1).csv",
    "clients": DOWNLOADS / "Supabase Snippet Untitled query (2).csv",
    "crm_atomic_operations": DOWNLOADS / "Supabase Snippet Untitled query (3).csv",
    "orders": DOWNLOADS / "Supabase Snippet Untitled query (4).csv",
    "ref_app_settings": DOWNLOADS / "Supabase Snippet Untitled query (5).csv",
    "ref_dropshippers": DOWNLOADS / "Supabase Snippet Untitled query (6).csv",
    "ref_payment_methods": DOWNLOADS / "Supabase Snippet Untitled query (7).csv",
    "ref_payment_statuses": DOWNLOADS / "Supabase Snippet Untitled query (8).csv",
    "ref_service_rates": DOWNLOADS / "Supabase Snippet Untitled query (9).csv",
    "ref_supplier_statuses": DOWNLOADS / "Supabase Snippet Untitled query (10).csv",
    "ref_warehouses": DOWNLOADS / "Supabase Snippet Untitled query (11).csv",
    "worker_problems": DOWNLOADS / "Supabase Snippet Untitled query (12).csv",
    "worker_salaries": DOWNLOADS / "Supabase Snippet Untitled query (13).csv",
    "workers": DOWNLOADS / "Supabase Snippet Untitled query (14).csv",
    "workers_public": DOWNLOADS / "Supabase Snippet Untitled query (15).csv",
    "car_directory": DOWNLOADS / "car_directory.csv",
}


REQUIRED_COLUMNS = {
    "orders": {
        "id", "date", "client", "phone", "total", "income", "delivery", "purchase",
        "drop_shipper_payout", "client_payments", "supplier_payments", "drop_shipper_payments",
        "is_cancelled", "worker_done", "status_done", "in_work",
    },
    "cash_log": {
        "id", "amount", "created_at", "cash_owner", "account_type", "payment_type",
        "approval_status", "source_type", "source_id", "order_id", "source_key", "ledger_status",
    },
    "worker_salaries": {"id", "worker_name", "worker_id", "date", "amount", "order_id", "entry_type"},
    "workers": {"id", "name", "system_role", "pin_hash"},
    "clients": {"id", "name", "phone", "created_at"},
    "ref_payment_methods": {"id", "label", "method_type", "worker_id", "requires_confirmation"},
}


def clean(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    s = str(v)
    if s.lower() == "null":
        return ""
    return s


def truthy(v):
    return str(v).strip().lower() in {"true", "t", "1", "yes", "y"}


def dec(v):
    s = clean(v).replace("\u20b4", "").replace(" ", "").strip()
    if not s:
        return Decimal("0")
    try:
        return Decimal(s)
    except InvalidOperation:
        return Decimal("0")


def out_decimal(v):
    d = dec(v) if not isinstance(v, Decimal) else v
    if d == d.to_integral():
        return str(d.quantize(Decimal("1")))
    return format(d.normalize(), "f")


def date_only(v):
    s = clean(v).strip()
    if not s:
        return ""
    return s[:10]


def date_value(v):
    value = date_only(v)
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def iso_ts(v):
    s = clean(v).strip()
    if not s:
        return ""
    if " " in s and "T" not in s:
        s = s.replace(" ", "T", 1)
    if s.endswith("+00"):
        s += ":00"
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return s


FULL_CARD_SPACED = re.compile(r"(?<!\d)(\d{4})(?: |%20)+(\d{4})(?: |%20)+(\d{4})(?: |%20)+(\d{4})(?!\d)")
MASKED_LAST4 = re.compile(r"(?:\u2022{4}|\*{4}|xxxx|XXXX)\s*(\d{4})")
SECRET_KEY = re.compile(r"(token|secret|api[_-]?key|password)", re.I)
FX_USD = re.compile(r"(?:^|\|)usd=(-?[0-9]+(?:[.,][0-9]+)?)", re.I)


def redact_cards(value):
    if value is None:
        return value
    # Preserve the source representation. Decoding the whole value used to
    # mutate URL-encoded source keys and made the "raw" safety copy unusable
    # for deterministic reconciliation.
    text = str(value)

    def repl_spaced(m):
        sep = "%20" if "%20" in m.group(0) else " "
        return "\u2022\u2022\u2022\u2022" + sep + m.group(4)

    text = FULL_CARD_SPACED.sub(repl_spaced, text)
    return text


def card_last4(value):
    s = clean(value)
    m = MASKED_LAST4.search(s)
    if m:
        return m.group(1)
    decoded = unquote(s)
    m = FULL_CARD_SPACED.search(decoded)
    if m:
        return m.group(4)
    return ""


def safe_label(value):
    return redact_cards(unquote(clean(value))).strip()


def safe_json_obj(obj):
    return json.loads(redact_cards(json.dumps(obj, ensure_ascii=False, default=str)))


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, fieldnames):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: clean(row.get(k, "")) for k in fieldnames})


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_json_field(value, default):
    s = clean(value).strip()
    if not s:
        return default
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return default


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build an audited SwiftGlass -> SG CRM migration package. The source CSV files are never modified."
    )
    parser.add_argument(
        "--cutoff",
        default="2026-06-15",
        help="First transaction date to import (YYYY-MM-DD). Older history is collapsed into opening balances.",
    )
    parser.add_argument(
        "--downloads-dir",
        type=Path,
        default=DOWNLOADS,
        help="Directory containing the exported Supabase CSV files.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "migration" / "packages",
        help="Parent directory for the generated package.",
    )
    parser.add_argument("--no-archive", action="store_true", help="Do not create a ZIP archive.")
    args = parser.parse_args()
    try:
        args.cutoff = date.fromisoformat(args.cutoff)
    except ValueError as exc:
        parser.error(f"invalid --cutoff: {exc}")
    return args


def source_files(downloads_dir):
    return {name: downloads_dir / path.name for name, path in SOURCE_FILES.items()}


def validate_headers(table, path, rows):
    required = REQUIRED_COLUMNS.get(table)
    if not required:
        return
    if not rows:
        raise SystemExit(f"Source table {table} is empty: {path}")
    missing = sorted(required - set(rows[0]))
    if missing:
        raise SystemExit(f"Unexpected columns in {path}; missing required columns: {', '.join(missing)}")


def payment_is_posted(payment):
    return isinstance(payment, dict) and payment.get("confirmed") is not False


def posted_payment_sum(row, field, before=None):
    result = Decimal("0")
    payments = parse_json_field(row.get(field), [])
    if not isinstance(payments, list):
        return result
    for payment in payments:
        if not payment_is_posted(payment):
            continue
        payment_date = date_value(payment.get("date") or payment.get("timestamp"))
        if before and payment_date and payment_date >= before:
            continue
        result += abs(dec(payment.get("amount")))
    return result


def client_total(row):
    return dec(row.get("total")) + dec(row.get("income")) + dec(row.get("delivery"))


def order_carry_reasons(row, cutoff):
    if (date_value(row.get("date")) or date.min) >= cutoff:
        return ["recent"]
    if truthy(row.get("is_cancelled")) or bool(clean(row.get("deleted_at"))):
        return []
    reasons = []
    if not truthy(row.get("worker_done")) and not truthy(row.get("status_done")):
        reasons.append("active")
    if client_total(row) - posted_payment_sum(row, "client_payments") > 0:
        reasons.append("client_debt")
    if dec(row.get("purchase")) - posted_payment_sum(row, "supplier_payments") > 0:
        reasons.append("supplier_debt")
    if dec(row.get("drop_shipper_payout")) - posted_payment_sum(row, "drop_shipper_payments") > 0:
        reasons.append("dropshipper_debt")
    return reasons


def finance_date(row):
    return date_value(row.get("fop_date")) or date_value(row.get("created_at"))


def salary_date(row):
    return date_value(row.get("date")) or date_value(row.get("created_at"))


def raw_rows_for_package(rows, selected_orders, selected_cash, selected_salary, cutoff):
    selected_order_ids = {clean(row.get("id")) for row in selected_orders}
    result = dict(rows)
    result["orders"] = selected_orders
    result["cash_log"] = selected_cash
    result["worker_salaries"] = selected_salary
    result["worker_problems"] = [
        row for row in rows["worker_problems"]
        if (date_value(row.get("date")) or date.min) >= cutoff or clean(row.get("order_id")) in selected_order_ids
    ]
    result["crm_atomic_operations"] = [
        row for row in rows["crm_atomic_operations"]
        if (date_value(row.get("created_at")) or date.min) >= cutoff
    ]
    return result


def raw_copy_redacted(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    with open(src, newline="", encoding="utf-8-sig") as inp, open(dst, "w", newline="", encoding="utf-8") as out:
        reader = csv.reader(inp)
        writer = csv.writer(out)
        for row in reader:
            writer.writerow([redact_cards(v) for v in row])


def write_raw_rows_redacted(src, dst, rows):
    dst.parent.mkdir(parents=True, exist_ok=True)
    with open(src, newline="", encoding="utf-8-sig") as source:
        fieldnames = csv.DictReader(source).fieldnames or []
    with open(dst, "w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: redact_cards(row.get(key, "")) for key in fieldnames})


def source_key_signature(source_key):
    s = unquote(clean(source_key))
    order = re.search(r"order:(SG-\d+)", s)
    typ = re.search(r"type:([^|]+)", s)
    amount = re.search(r"amount:([^|]+)", s)
    date = re.search(r"date:([^|]+)", s)
    ts = re.search(r"ts:([^|]+)", s)
    if not (order and typ and amount and date and ts):
        return None
    return (order.group(1), typ.group(1), out_decimal(abs(dec(amount.group(1)))), date.group(1), ts.group(1))


def payment_method_kind(label, methods_by_label):
    safe = safe_label(label)
    method = methods_by_label.get(safe)
    if method:
        return method.get("method_type") or ("card" if method.get("card_last4") else "cash")
    lowered = safe.lower()
    if "карта" in lowered or "mono" in lowered or "privat" in lowered or "\u2022\u2022\u2022\u2022" in safe or "безнал" in lowered or "фоп" in lowered:
        return "card"
    return "cash"


def payment_method_from_cash(row, methods_by_label):
    label = safe_label(row.get("payment_method") or row.get("manual_payment_method"))
    if not label:
        label = safe_label(payment_method_from_source_key(row.get("source_key") or row.get("source_id")))
    if not label:
        comment = safe_label(row.get("comment"))
        matches = [method_label for method_label in methods_by_label if method_label and method_label in comment]
        if len(matches) == 1:
            label = matches[0]
        else:
            last4_matches = [
                method_label for method_label, method in methods_by_label.items()
                if method.get("card_last4") and method.get("card_last4") in comment
            ]
            if len(last4_matches) == 1:
                label = last4_matches[0]
    if not label and account_type_from_cash(row) == "card":
        owner = clean(row.get("cash_owner")) or clean(row.get("worker_name")) or "без владельца"
        label = f"Карта · {owner} (legacy)"
    return label, methods_by_label.get(label)


def payment_method_from_source_key(value):
    source = clean(value)
    match = re.search(r"(?:^|\|)method:([^|]+)", source)
    return unquote(match.group(1)) if match else ""


def usd_delta(row):
    match = FX_USD.search(clean(row.get("comment")))
    return dec(match.group(1).replace(",", ".")) if match else Decimal("0")


def finance_account_identity(row, methods_by_label, worker_name_to_id, currency_code="UAH"):
    worker_id = (
        clean(row.get("cash_owner_id"))
        or clean(row.get("worker_id"))
        or worker_name_to_id.get(clean(row.get("cash_owner")) or clean(row.get("worker_name")), "")
    )
    account_type = account_type_from_cash(row)
    label, method = payment_method_from_cash(row, methods_by_label)
    method_id = clean(method.get("legacy_payment_method_id")) if method else ""
    if not worker_id and method:
        worker_id = clean(method.get("worker_legacy_id"))
    if account_type == "cash":
        method_id = ""
        label = ""
    elif not method_id:
        # A stable unresolved code prevents unrelated cards from being merged.
        fingerprint = hashlib.sha256(label.encode("utf-8")).hexdigest()[:16]
        method_id = f"unresolved:{fingerprint}"
    return account_type, worker_id, method_id, label, currency_code


def main():
    global CUTOFF, PACKAGE_DIR, EXPORTED_AT
    args = parse_args()
    CUTOFF = args.cutoff
    EXPORTED_AT = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    package_name = f"swiftglass_migration_from_{CUTOFF.isoformat()}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    PACKAGE_DIR = args.output_dir / package_name
    files = source_files(args.downloads_dir)

    missing = [str(p) for p in files.values() if not p.exists()]
    if missing:
        raise SystemExit("Missing source files:\n" + "\n".join(missing))

    raw_dir = PACKAGE_DIR / "raw"
    norm_dir = PACKAGE_DIR / "normalized"
    report_dir = PACKAGE_DIR / "reports"
    issues = []
    source_mapping = []

    rows = {name: read_csv(path) for name, path in files.items()}
    for table, path in files.items():
        validate_headers(table, path, rows[table])

    selected_cash = [row for row in rows["cash_log"] if (finance_date(row) or date.min) >= CUTOFF]
    selected_salary = [row for row in rows["worker_salaries"] if (salary_date(row) or date.min) >= CUTOFF]
    selected_problems = [
        row for row in rows["worker_problems"] if (date_value(row.get("date")) or date.min) >= CUTOFF
    ]
    dependency_order_ids = {
        clean(row.get("order_id"))
        for row in selected_cash + selected_salary + selected_problems
        if clean(row.get("order_id")).startswith("SG-")
    }
    carry_reason_counts = Counter()
    selected_orders = []
    for row in rows["orders"]:
        reasons = order_carry_reasons(row, CUTOFF)
        if not reasons and clean(row.get("id")) in dependency_order_ids:
            reasons = ["recent_dependency"]
        if reasons:
            selected_orders.append(row)
            carry_reason_counts.update(reason for reason in reasons if reason != "recent")
    packaged_raw_rows = raw_rows_for_package(rows, selected_orders, selected_cash, selected_salary, CUTOFF)

    for table, src in files.items():
        dst_name = f"{table}.csv"
        write_raw_rows_redacted(src, raw_dir / dst_name, packaged_raw_rows[table])
        source_mapping.append({
            "table_name": table,
            "source_file": str(src),
            "package_file": f"raw/{dst_name}",
            "source_rows": len(rows[table]),
            "package_rows": len(packaged_raw_rows[table]),
            "source_sha256": sha256(src),
        })

    all_orders = rows["orders"]
    all_cash = rows["cash_log"]
    all_salary = rows["worker_salaries"]
    rows["orders"] = selected_orders
    rows["cash_log"] = selected_cash
    rows["worker_salaries"] = selected_salary

    write_json(norm_dir / "company.json", {
        "legacy_company_key": "swiftglass",
        "name": "SwiftGlass",
        "slug": "swiftglass",
        "timezone": "Europe/Kiev",
        "default_currency": "UAH",
    })

    worker_name_to_id = {}
    worker_ids = set()
    workers_out = []
    valid_roles = {"owner", "manager", "senior", "junior", "extra"}
    dropshipper_worker_ids = {clean(r.get("worker_id")) for r in rows["ref_dropshippers"] if clean(r.get("worker_id"))}

    for r in rows["workers"]:
        wid = clean(r.get("id"))
        worker_ids.add(wid)
        if clean(r.get("name")):
            worker_name_to_id[clean(r.get("name"))] = wid
        role = clean(r.get("system_role")) or "extra"
        if role not in valid_roles:
            issues.append(issue("warning", "worker", wid, "unknown_system_role", f"Unknown system_role: {role}", "", r))
        workers_out.append({
            "legacy_worker_id": wid,
            "name": clean(r.get("name")),
            "alias": clean(r.get("alias")),
            "role_label": clean(r.get("role")),
            "system_role": role if role in valid_roles else "extra",
            "pin_hash": clean(r.get("pin_hash")),
            "note": clean(r.get("note")),
            "telegram_nick": clean(r.get("telegram_nick")),
            "is_dropshipper": str(wid in dropshipper_worker_ids).lower(),
            "salary_formula_json": json.dumps(parse_json_field(r.get("salary_formula"), {}), ensure_ascii=False),
            "created_at": iso_ts(r.get("created_at")),
            "legacy_payload_json": json.dumps(safe_json_obj(r), ensure_ascii=False),
        })

    for d in rows["ref_dropshippers"]:
        linked = clean(d.get("worker_id"))
        if linked and linked in worker_ids:
            continue
        did = clean(d.get("id"))
        workers_out.append({
            "legacy_worker_id": did,
            "name": clean(d.get("name")),
            "alias": "",
            "role_label": "Дропшиппер",
            "system_role": "extra",
            "pin_hash": "",
            "note": clean(d.get("note")),
            "telegram_nick": "",
            "is_dropshipper": "true",
            "salary_formula_json": "{}",
            "created_at": iso_ts(d.get("created_at")),
            "legacy_payload_json": json.dumps(safe_json_obj(d), ensure_ascii=False),
        })
        worker_ids.add(did)
        if clean(d.get("name")):
            worker_name_to_id[clean(d.get("name"))] = did

    write_csv(norm_dir / "workers.csv", workers_out, [
        "legacy_worker_id", "name", "alias", "role_label", "system_role", "pin_hash", "note",
        "telegram_nick", "is_dropshipper", "salary_formula_json", "created_at", "legacy_payload_json"
    ])

    client_key_to_id = {}
    client_phone_to_ids = defaultdict(list)
    client_name_to_ids = defaultdict(list)
    client_rows = []
    for r in rows["clients"]:
        cid = clean(r.get("id"))
        name_norm = clean(r.get("name")).strip().lower()
        phone_norm = clean(r.get("phone")).strip()
        if phone_norm:
            client_phone_to_ids[phone_norm].append(cid)
        if name_norm:
            client_name_to_ids[name_norm].append(cid)
        key = (clean(r.get("name")).strip().lower(), clean(r.get("phone")).strip())
        if key != ("", ""):
            if key in client_key_to_id:
                issues.append(issue("warning", "client", cid, "possible_duplicate_client", "Same name + phone as another client", client_key_to_id[key], r))
            else:
                client_key_to_id[key] = cid
        client_rows.append({
            "legacy_client_id": cid,
            "name": clean(r.get("name")),
            "phone": clean(r.get("phone")),
            "address": clean(r.get("address")),
            "created_at": iso_ts(r.get("created_at")),
            "updated_at": "",
            "legacy_payload_json": json.dumps(safe_json_obj(r), ensure_ascii=False),
        })
    write_csv(norm_dir / "clients.csv", client_rows, [
        "legacy_client_id", "name", "phone", "address", "created_at", "updated_at", "legacy_payload_json"
    ])

    methods_out = []
    methods_by_label = {}
    method_by_id = {}
    for r in rows["ref_payment_methods"]:
        label = safe_label(r.get("label"))
        method_type = clean(r.get("method_type"))
        if method_type == "fop":
            method_type = "card"
        last4 = card_last4(r.get("label"))
        methods_out.append({
            "legacy_payment_method_id": clean(r.get("id")),
            "label": label,
            "method_type": method_type or ("card" if last4 else "cash"),
            "worker_legacy_id": clean(r.get("worker_id")) or worker_name_to_id.get(clean(r.get("worker_name")), ""),
            "card_last4": last4,
            "requires_confirmation": str(truthy(r.get("requires_confirmation")) or method_type in {"card", "fop"}).lower(),
            "active": str(truthy(r.get("active"))).lower(),
            "sort_order": clean(r.get("sort_order")),
            "created_at": iso_ts(r.get("created_at")),
            "updated_at": iso_ts(r.get("updated_at")),
        })
        methods_by_label[label] = methods_out[-1]
        method_by_id[clean(r.get("id"))] = methods_out[-1]

    for cash_row in all_cash:
        if account_type_from_cash(cash_row) != "card":
            continue
        label, existing_method = payment_method_from_cash(cash_row, methods_by_label)
        if existing_method:
            continue
        worker_id = (
            clean(cash_row.get("cash_owner_id"))
            or clean(cash_row.get("worker_id"))
            or worker_name_to_id.get(clean(cash_row.get("cash_owner")) or clean(cash_row.get("worker_name")), "")
        )
        if not worker_id:
            issues.append(issue(
                "error", "payment_method", clean(cash_row.get("id")), "legacy_card_owner_missing",
                "Cannot create a card account because the legacy owner is unknown", "", cash_row,
            ))
            continue
        generated_id = "generated:" + hashlib.sha256(f"{worker_id}:{label}".encode("utf-8")).hexdigest()[:16]
        generated = {
            "legacy_payment_method_id": generated_id,
            "label": label,
            "method_type": "card",
            "worker_legacy_id": worker_id,
            "card_last4": card_last4(label),
            "requires_confirmation": "true",
            "active": "false",
            "sort_order": "999",
            "created_at": iso_ts(cash_row.get("created_at")),
            "updated_at": iso_ts(cash_row.get("created_at")),
        }
        methods_out.append(generated)
        methods_by_label[label] = generated
        method_by_id[generated_id] = generated
        issues.append(issue(
            "info", "payment_method", generated_id, "legacy_card_method_created",
            "Created an inactive named card for legacy movements that had no reference method", worker_id, cash_row,
        ))
    write_csv(norm_dir / "payment_methods.csv", methods_out, [
        "legacy_payment_method_id", "label", "method_type", "worker_legacy_id", "card_last4",
        "requires_confirmation", "active", "sort_order", "created_at", "updated_at"
    ])

    cash_by_sig = defaultdict(list)
    cash_by_source_key = defaultdict(list)
    for c in all_cash:
        sk = clean(c.get("source_key"))
        if sk:
            cash_by_source_key[sk].append(c)
        sig = source_key_signature(sk or c.get("source_id"))
        if sig:
            cash_by_sig[sig].append(c)

    orders_out = []
    order_payments = []
    order_ids = set()
    order_status_counts = Counter()
    total_orders_amount = Decimal("0")
    confirmed_client_payments_by_order = defaultdict(Decimal)
    confirmed_supplier_payments_by_order = defaultdict(Decimal)
    confirmed_dropshipper_payments_by_order = defaultdict(Decimal)
    supplier_due_by_order = defaultdict(Decimal)
    dropshipper_due_by_order = defaultdict(Decimal)
    synthetic_clients = {}

    for r in rows["orders"]:
        oid = clean(r.get("id"))
        order_ids.add(oid)
        client_key = (clean(r.get("client")).strip().lower(), clean(r.get("phone")).strip())
        client_id = client_key_to_id.get(client_key, "")
        if not client_id and client_key[1] and len(client_phone_to_ids.get(client_key[1], [])) == 1:
            client_id = client_phone_to_ids[client_key[1]][0]
        if not client_id and client_key[0] and len(client_name_to_ids.get(client_key[0], [])) == 1:
            client_id = client_name_to_ids[client_key[0]][0]
        if not client_id and client_key[1] and len(client_phone_to_ids.get(client_key[1], [])) > 1:
            issues.append(issue("warning", "order", oid, "ambiguous_client_phone", "More than one client has the same phone", "", r))
        if not client_id:
            synthetic_key = client_key if client_key != ("", "") else ("order", oid)
            client_id = synthetic_clients.get(synthetic_key)
            if not client_id:
                client_id = str(uuid5(NAMESPACE_URL, f"swiftglass:client:{synthetic_key[0]}:{synthetic_key[1]}"))
                synthetic_clients[synthetic_key] = client_id
                client_rows.append({
                    "legacy_client_id": client_id,
                    "name": clean(r.get("client")) or "Клиент без имени",
                    "phone": clean(r.get("phone")),
                    "address": clean(r.get("address")),
                    "created_at": iso_ts(r.get("created_at")),
                    "updated_at": "",
                    "legacy_payload_json": json.dumps({
                        "synthetic": True,
                        "source_order_id": oid,
                        "legacy_client_name": clean(r.get("client")),
                        "legacy_client_phone": clean(r.get("phone")),
                    }, ensure_ascii=False),
                })
            issues.append(issue("info", "order", oid, "synthetic_client_created", "Created deterministic client for an unmatched legacy order", client_id, r))

        services = parse_services(r.get("service_type"), issues, oid)
        is_cancelled = truthy(r.get("is_cancelled")) or bool(clean(r.get("deleted_at")))
        if is_cancelled:
            work_status = "cancelled"
        elif truthy(r.get("worker_done")) or truthy(r.get("status_done")):
            work_status = "completed"
        elif truthy(r.get("in_work")):
            work_status = "in_work"
        else:
            work_status = "scheduled"

        base_total_amount = dec(r.get("total"))
        total_amount = client_total(r)
        total_orders_amount += total_amount
        for kind, field in [("client", "client_payments"), ("supplier", "supplier_payments"), ("dropshipper", "drop_shipper_payments")]:
            payment_list = parse_json_field(r.get(field), [])
            if not isinstance(payment_list, list):
                issues.append(issue("warning", "order", oid, "payment_json_not_array", f"{field} is not an array", "", {field: r.get(field)}))
                payment_list = []
            for idx, p in enumerate(payment_list):
                if not isinstance(p, dict):
                    continue
                amount = abs(dec(p.get("amount")))
                method_label = safe_label(p.get("method"))
                payment_date = date_only(p.get("date"))
                ts = clean(p.get("timestamp"))
                sig = (oid, kind, out_decimal(amount), payment_date, ts)
                cash_match = cash_by_sig.get(sig, [])
                cash_row = cash_match[0] if cash_match else None
                if len(cash_match) > 1:
                    issues.append(issue("warning", "order_payment", oid, "ambiguous_cash_match", f"{len(cash_match)} cash_log rows match payment {kind}[{idx}]", "", p))
                account_type = account_type_from_cash(cash_row) if cash_row else payment_method_kind(method_label, methods_by_label)
                approval_status = clean(cash_row.get("approval_status")) if cash_row else (
                    "pending" if p.get("confirmed") is False else "not_required"
                )
                status = payment_status_from_cash(cash_row, account_type, p)
                if status == "posted" and kind == "client":
                    confirmed_client_payments_by_order[oid] += amount
                if status == "posted" and kind == "supplier":
                    confirmed_supplier_payments_by_order[oid] += amount
                if status == "posted" and kind == "dropshipper":
                    confirmed_dropshipper_payments_by_order[oid] += amount
                method_id = ""
                if method_label in methods_by_label:
                    method_id = methods_by_label[method_label]["legacy_payment_method_id"]
                source_key = redact_cards(clean(cash_row.get("source_key"))) if cash_row else ""
                order_payments.append({
                    "legacy_payment_id": clean(cash_row.get("id")) if cash_row else "",
                    "legacy_payment_key": f"order:{oid}|kind:{kind}|idx:{idx}|date:{payment_date}|amount:{out_decimal(amount)}",
                    "order_legacy_id": oid,
                    "client_legacy_id": client_id,
                    "payment_kind": kind,
                    "direction": "in" if kind == "client" else "out",
                    "amount": out_decimal(amount),
                    "currency_code": "UAH",
                    "payment_method_legacy_id": method_id,
                    "payment_method_label": method_label,
                    "account_type": "cash" if account_type == "cash" else "card",
                    "cash_worker_legacy_id": (
                        clean(cash_row.get("cash_owner_id")) or clean(cash_row.get("worker_id"))
                    ) if cash_row else "",
                    "status": status,
                    "approval_status": approval_status,
                    "payment_date": payment_date,
                    "occurred_at": iso_ts(p.get("timestamp")) or iso_ts(cash_row.get("created_at") if cash_row else ""),
                    "comment": safe_label(cash_row.get("comment")) if cash_row else "",
                    "reversal_of_legacy_payment_id": clean(cash_row.get("reversal_of")) if cash_row else "",
                    "source_table": "cash_log" if cash_row else "orders",
                    "source_row_id": clean(cash_row.get("id")) if cash_row else oid,
                    "source_key": source_key,
                    "has_cash_movement": str(bool(cash_row) and (finance_date(cash_row) or date.min) >= CUTOFF).lower(),
                    "metadata_json": json.dumps(safe_json_obj(p), ensure_ascii=False),
                })
                if not cash_row:
                    issues.append(issue("warning", "order_payment", oid, "cash_movement_missing", f"{kind} payment exists in order JSON but no matching cash_log row", "", p))

        supplier_due_by_order[oid] = dec(r.get("purchase"))
        dropshipper_due_by_order[oid] = dec(r.get("drop_shipper_payout"))
        financial_status = "cancelled" if is_cancelled else ("paid" if total_amount - confirmed_client_payments_by_order[oid] <= 0 else "open")
        order_status_counts[work_status] += 1
        orders_out.append({
            "legacy_order_id": oid,
            "date": date_only(r.get("date")),
            "time": clean(r.get("time")),
            "day_sort": clean(r.get("day_sort")),
            "created_at": iso_ts(r.get("created_at")),
            "updated_at": "",
            "completed_at": "",
            "completed_at_inferred": "",
            "work_status": work_status,
            "financial_status": financial_status,
            "is_cancelled": str(is_cancelled).lower(),
            "deleted_at": iso_ts(r.get("deleted_at")),
            "deleted_by": clean(r.get("deleted_by")),
            "client_legacy_id": client_id,
            "client_name": clean(r.get("client")),
            "client_phone": clean(r.get("phone")),
            "client_address": clean(r.get("address")),
            "responsible_worker_legacy_id": clean(r.get("responsible_worker_id")) or worker_name_to_id.get(clean(r.get("responsible")), ""),
            "assistant_worker_legacy_id": clean(r.get("assistant_worker_id")) or worker_name_to_id.get(clean(r.get("assistant")), ""),
            "extra_assistant_worker_legacy_id": clean(r.get("extra_assistant_worker_id")) or worker_name_to_id.get(clean(r.get("extra_assistant")), ""),
            "manager_worker_legacy_id": clean(r.get("manager_worker_id")) or worker_name_to_id.get(clean(r.get("manager")), ""),
            "author_name": clean(r.get("author")),
            "car": clean(r.get("car")),
            "vin": clean(r.get("vin")),
            "license_plate": clean(r.get("license_plate")),
            "eurocode": clean(r.get("code")),
            "glass_manufacturer": clean(r.get("glass_manufacturer")),
            "configuration": clean(r.get("configuration")),
            "services_json": json.dumps(services, ensure_ascii=False),
            "mount_amount": out_decimal(r.get("mount")),
            "molding_amount": out_decimal(r.get("molding")),
            "extra_work_amount": out_decimal(r.get("extra_work")),
            "tatu_amount": out_decimal(r.get("tatu")),
            "toning_amount": out_decimal(r.get("toning")),
            "delivery_amount": out_decimal(r.get("delivery")),
            "tatu_status": str(truthy(r.get("tatu_status"))).lower(),
            "tatu_done": str(truthy(r.get("tatu_done"))).lower(),
            "tatu_done_by": clean(r.get("tatu_done_by")),
            "tatu_worker_legacy_id": clean(r.get("tatu_responsible_worker_id")),
            "toning_status": str(truthy(r.get("toning_status"))).lower(),
            "toning_done": str(truthy(r.get("toning_done"))).lower(),
            "toning_done_by": clean(r.get("toning_done_by")),
            "toning_worker_legacy_id": clean(r.get("toning_responsible_worker_id")),
            "toning_external": str(truthy(r.get("toning_external"))).lower(),
            "tatu_completed_at": iso_ts(r.get("tatu_completed_at")),
            "tatu_completed_by_worker_legacy_id": clean(r.get("tatu_completed_by_worker_id")),
            "tatu_salary_amount": out_decimal(r.get("tatu_salary_amount")),
            "tatu_salary_rate": out_decimal(r.get("tatu_salary_rate")),
            "toning_completed_at": iso_ts(r.get("toning_completed_at")),
            "toning_completed_by_worker_legacy_id": clean(r.get("toning_completed_by_worker_id")),
            "toning_salary_amount": out_decimal(r.get("toning_salary_amount")),
            "toning_salary_rate": out_decimal(r.get("toning_salary_rate")),
            "base_total_amount": out_decimal(base_total_amount),
            "income_amount": out_decimal(r.get("income")),
            "total_amount": out_decimal(total_amount),
            "check_amount": out_decimal(r.get("check_sum")),
            "debt_amount_legacy": out_decimal(r.get("debt")),
            "remainder_amount": out_decimal(r.get("remainder")),
            "purchase_amount": out_decimal(r.get("purchase")),
            "dropshipper_amount": out_decimal(r.get("drop_shipper_payout")),
            "margin_amount": out_decimal(r.get("margin_total")),
            "payment_status_legacy": clean(r.get("payment_status")),
            "supplier_status_legacy": clean(r.get("supplier_status")),
            "debt_date": date_only(r.get("debt_date")),
            "partner": clean(r.get("partner")),
            "warehouse": clean(r.get("warehouse")),
            "warehouse_code": clean(r.get("warehouse_code")),
            "new_post": str(truthy(r.get("new_post"))).lower(),
            "only_cut": str(truthy(r.get("only_cut"))).lower(),
            "only_sale": str(truthy(r.get("only_sale"))).lower(),
            "own_warehouse": str(truthy(r.get("own_warehouse"))).lower(),
            "call_status": str(truthy(r.get("call_status"))).lower(),
            "price_locked": str(truthy(r.get("price_locked"))).lower(),
            "dropshipper_worker_legacy_id": worker_name_to_id.get(clean(r.get("drop_shipper")), ""),
            "payout_manager_amount": out_decimal(r.get("payout_manager_glass")),
            "payout_responsible_amount": out_decimal(r.get("payout_resp_glass")),
            "payout_extra_responsible_amount": out_decimal(r.get("payout_extra_resp")),
            "payout_extra_assistant_amount": out_decimal(r.get("payout_extra_assist")),
            "payout_molding_responsible_amount": out_decimal(r.get("payout_molding_resp")),
            "payout_molding_assistant_amount": out_decimal(r.get("payout_molding_assist")),
            "notes": clean(r.get("notes")),
            "extra_note": clean(r.get("extra_note")),
            "rework_data_json": json.dumps(parse_json_field(r.get("rework_data"), {}), ensure_ascii=False),
            "service_price_audit_json": json.dumps(parse_json_field(r.get("service_price_audit"), []), ensure_ascii=False),
            "telegram_messages_json": "{}",
            "legacy_payload_json": json.dumps(safe_json_obj(r), ensure_ascii=False),
        })

    # The first pass may add deterministic synthetic clients for legacy orders
    # that were never linked to the old clients table.
    write_csv(norm_dir / "clients.csv", client_rows, [
        "legacy_client_id", "name", "phone", "address", "created_at", "updated_at", "legacy_payload_json"
    ])

    write_csv(norm_dir / "orders.csv", orders_out, [
        "legacy_order_id", "date", "time", "day_sort", "created_at", "updated_at", "completed_at", "completed_at_inferred",
        "work_status", "financial_status", "is_cancelled", "deleted_at", "deleted_by", "client_legacy_id", "client_name",
        "client_phone", "client_address", "responsible_worker_legacy_id", "assistant_worker_legacy_id", "extra_assistant_worker_legacy_id",
        "manager_worker_legacy_id", "author_name", "car", "vin", "license_plate", "eurocode", "glass_manufacturer", "configuration",
        "services_json", "mount_amount", "molding_amount", "extra_work_amount", "tatu_amount", "toning_amount", "delivery_amount",
        "tatu_status", "tatu_done", "tatu_done_by", "tatu_worker_legacy_id", "toning_status", "toning_done", "toning_done_by",
        "toning_worker_legacy_id", "toning_external", "tatu_completed_at", "tatu_completed_by_worker_legacy_id",
        "tatu_salary_amount", "tatu_salary_rate", "toning_completed_at", "toning_completed_by_worker_legacy_id",
        "toning_salary_amount", "toning_salary_rate", "base_total_amount", "income_amount", "total_amount",
        "check_amount", "debt_amount_legacy", "remainder_amount", "purchase_amount", "dropshipper_amount", "margin_amount",
        "payment_status_legacy", "supplier_status_legacy", "debt_date", "partner", "warehouse", "warehouse_code", "new_post",
        "only_cut", "only_sale", "own_warehouse", "call_status", "price_locked", "dropshipper_worker_legacy_id", "payout_manager_amount",
        "payout_responsible_amount", "payout_extra_responsible_amount", "payout_extra_assistant_amount",
        "payout_molding_responsible_amount", "payout_molding_assistant_amount", "notes", "extra_note", "rework_data_json",
        "service_price_audit_json", "telegram_messages_json", "legacy_payload_json"
    ])

    write_csv(norm_dir / "order_payments.csv", order_payments, [
        "legacy_payment_id", "legacy_payment_key", "order_legacy_id", "client_legacy_id", "payment_kind", "direction",
        "amount", "currency_code", "payment_method_legacy_id", "payment_method_label", "account_type", "cash_worker_legacy_id",
        "status", "approval_status", "payment_date", "occurred_at", "comment", "reversal_of_legacy_payment_id",
        "source_table", "source_row_id", "source_key", "has_cash_movement", "metadata_json"
    ])

    finance_rows = []
    for c in rows["cash_log"]:
        amount_signed = dec(c.get("amount"))
        if amount_signed == 0:
            issues.append(issue("info", "finance_movement", clean(c.get("id")), "zero_finance_amount", "cash_log amount is zero", "", c))
        direction = "in" if amount_signed >= 0 else "out"
        amount = abs(amount_signed)
        status = finance_status(c)
        include_confirmed = include_confirmed_balance(c)
        include_pending = include_pending_balance(c)
        account_type, worker_id, method_id, method_label, _ = finance_account_identity(
            c, methods_by_label, worker_name_to_id
        )
        usd_amount = usd_delta(c)
        raw_order_id = clean(c.get("order_id"))
        movement = {
            "legacy_movement_id": clean(c.get("id")),
            "operation_type": operation_type(c, direction),
            "operation_date": date_only(c.get("fop_date")) or date_only(c.get("created_at")),
            "occurred_at": iso_ts(c.get("created_at")),
            "signed_amount": out_decimal(amount_signed),
            "amount": out_decimal(amount),
            "direction": direction,
            "currency_code": "UAH",
            "secondary_currency_code": "USD" if usd_amount else "",
            "secondary_signed_amount": out_decimal(usd_amount) if usd_amount else "",
            "cash_worker_legacy_id": worker_id,
            "payment_method_legacy_id": method_id,
            "payment_method_label": method_label,
            "account_type": account_type,
            "order_legacy_id": raw_order_id if raw_order_id in order_ids else "",
            "unresolved_order_legacy_id": raw_order_id if raw_order_id and raw_order_id not in order_ids else "",
            "salary_legacy_id": clean(c.get("source_id")) if clean(c.get("source_type")) == "salary" else "",
            "category": clean(c.get("expense_category")),
            "warehouse": clean(c.get("warehouse_name")),
            "status": status,
            "approval_status": clean(c.get("approval_status")),
            "include_in_confirmed_balance": str(include_confirmed).lower(),
            "include_in_pending_balance": str(include_pending).lower(),
            "source_type": clean(c.get("source_type")),
            "source_id": redact_cards(clean(c.get("source_id"))),
            "source_key": redact_cards(clean(c.get("source_key"))),
            "reversal_of_legacy_movement_id": clean(c.get("reversal_of")),
            "correction_of_legacy_movement_id": clean(c.get("correction_of")),
            "comment": safe_label(c.get("comment")),
            "deleted_at": iso_ts(c.get("deleted_at")),
            "deleted_by": clean(c.get("deleted_by")),
            "metadata_json": json.dumps(safe_json_obj(c), ensure_ascii=False),
        }
        finance_rows.append(movement)
        if not movement["cash_worker_legacy_id"] and movement["account_type"] == "card":
            issues.append(issue("warning", "finance_movement", clean(c.get("id")), "missing_cash_owner", "Card movement has no cash owner/worker id", "", c))
        if clean(c.get("order_id")) and clean(c.get("order_id")) not in order_ids:
            issues.append(issue("warning", "finance_movement", clean(c.get("id")), "missing_order", "cash_log references missing order_id", clean(c.get("order_id")), c))

    write_csv(norm_dir / "finance_movements.csv", finance_rows, [
        "legacy_movement_id", "operation_type", "operation_date", "occurred_at", "signed_amount", "amount", "direction",
        "currency_code", "secondary_currency_code", "secondary_signed_amount", "cash_worker_legacy_id",
        "payment_method_legacy_id", "payment_method_label", "account_type",
        "order_legacy_id", "unresolved_order_legacy_id", "salary_legacy_id", "category", "warehouse", "status", "approval_status",
        "include_in_confirmed_balance", "include_in_pending_balance", "source_type", "source_id", "source_key",
        "reversal_of_legacy_movement_id", "correction_of_legacy_movement_id", "comment", "deleted_at", "deleted_by", "metadata_json"
    ])

    opening = cash_opening_rows(all_cash, CUTOFF, methods_by_label, worker_name_to_id)
    opening += debt_opening_rows(all_orders, CUTOFF)
    opening += salary_opening_rows(all_salary, CUTOFF, worker_name_to_id)
    write_csv(norm_dir / "opening_balances.csv", opening, [
        "balance_type", "worker_legacy_id", "payment_method_legacy_id", "account_type", "currency_code",
        "confirmed_amount", "pending_amount", "calculated_at", "source_rows_count", "metadata_json"
    ])

    salary_rows, salary_balances, salary_duplicates = normalize_salary(rows["worker_salaries"], worker_name_to_id, issues)
    write_csv(norm_dir / "salary_events.csv", salary_rows, [
        "legacy_salary_id", "worker_legacy_id", "worker_name", "event_date", "occurred_at", "signed_amount",
        "event_kind", "order_legacy_id", "source_key", "comment", "created_by", "edit_history_json",
        "suspected_duplicate", "duplicate_group_key", "legacy_payload_json"
    ])
    write_csv(norm_dir / "salary_balances.csv", salary_balances, [
        "worker_legacy_id", "accrued_total", "paid_total", "corrections_total",
        "current_balance_raw", "current_balance_without_suspected_duplicates", "calculated_at"
    ])
    write_csv(report_dir / "excluded_salary_duplicates.csv", salary_duplicates, [
        "legacy_salary_id", "kept_legacy_salary_id", "worker_legacy_id", "order_legacy_id",
        "event_date", "amount", "reason"
    ])

    copy_simple_dirs(norm_dir, rows, all_cash)
    normalize_app_settings(norm_dir / "app_settings.json", rows["ref_app_settings"], issues)
    normalize_worker_problems(norm_dir, packaged_raw_rows["worker_problems"], worker_name_to_id, order_ids, issues)

    current_cash_balances = cash_opening_rows(all_cash, date.max, methods_by_label, worker_name_to_id)
    current_salary_balances = salary_opening_rows(all_salary, date.max, worker_name_to_id)
    current_debts = debt_opening_rows(all_orders, date.max)
    selected_current_debts = debt_opening_rows(selected_orders, date.max)
    validation = validate_package_data(
        orders_out, client_rows, workers_out, methods_out, order_payments,
        finance_rows, opening, salary_rows, issues, current_cash_balances,
        current_salary_balances, current_debts, selected_current_debts,
    )
    write_json(report_dir / "validation.json", validation)

    write_csv(report_dir / "source_files_mapping.csv", source_mapping, [
        "table_name", "source_file", "package_file", "source_rows", "package_rows", "source_sha256"
    ])
    write_csv(report_dir / "migration_issues.csv", issues, ["severity", "entity_type", "legacy_id", "issue_code", "message", "related_legacy_id", "data_json"])

    files_manifest = {}
    for sub in ["raw", "normalized", "reports"]:
        for p in sorted((PACKAGE_DIR / sub).glob("*")):
            if p.is_file() and p.name != "manifest.json":
                files_manifest[f"{sub}/{p.name}"] = {"rows": count_rows(p), "sha256": sha256(p)}

    reconciliation = {
        "exported_at": EXPORTED_AT,
        "cutoff": CUTOFF.isoformat(),
        "selection": {
            "source_orders": len(all_orders),
            "recent_orders": sum(1 for row in all_orders if (date_value(row.get("date")) or date.min) >= CUTOFF),
            "older_unresolved_orders": len(selected_orders) - sum(1 for row in all_orders if (date_value(row.get("date")) or date.min) >= CUTOFF),
            "excluded_old_closed_orders": len(all_orders) - len(selected_orders),
            "carry_reasons": dict(carry_reason_counts),
            "source_cash_movements": len(all_cash),
            "imported_cash_movements": len(selected_cash),
            "collapsed_cash_movements": len(all_cash) - len(selected_cash),
            "source_salary_events": len(all_salary),
            "imported_salary_events_before_deduplication": len(selected_salary),
            "imported_salary_events": len(salary_rows),
        },
        "orders_by_work_status": dict(order_status_counts),
        "orders_total_amount": out_decimal(total_orders_amount),
        "client_payments_posted": out_decimal(sum((dec(p["amount"]) for p in order_payments if p["payment_kind"] == "client" and p["status"] == "posted"), Decimal("0"))),
        "client_payments_pending": out_decimal(sum((dec(p["amount"]) for p in order_payments if p["payment_kind"] == "client" and p["status"] == "pending"), Decimal("0"))),
        "supplier_payments_posted": out_decimal(sum((dec(p["amount"]) for p in order_payments if p["payment_kind"] == "supplier" and p["status"] == "posted"), Decimal("0"))),
        "dropshipper_payments_posted": out_decimal(sum((dec(p["amount"]) for p in order_payments if p["payment_kind"] == "dropshipper" and p["status"] == "posted"), Decimal("0"))),
        "opening_balances_at_cutoff": [
            {"account_type": o["account_type"], "worker_legacy_id": o["worker_legacy_id"], "payment_method_label": "", "confirmed_amount": o["confirmed_amount"], "pending_amount": o["pending_amount"], "source_rows_count": o["source_rows_count"]}
            for o in opening if o["balance_type"] in {"cash", "card"}
        ],
        "current_cash_balances_from_full_source": current_cash_balances,
        "salary_by_worker": salary_balances,
        "opening_debts_at_cutoff": [row for row in opening if row["balance_type"] in {"client_receivable", "supplier_payable", "dropshipper_payable"}],
        "current_debts_from_full_source": current_debts,
        "deleted_cash_rows": sum(1 for c in all_cash if clean(c.get("deleted_at"))),
        "voided_cash_rows": sum(1 for c in all_cash if clean(c.get("ledger_status")) == "voided"),
        "reversed_cash_rows": sum(1 for c in all_cash if clean(c.get("reversal_of"))),
        "corrected_cash_rows": sum(1 for c in all_cash if clean(c.get("correction_of"))),
        "salary_excluded_duplicate_rows": len(salary_duplicates),
        "issue_counts": dict(Counter(i["severity"] for i in issues)),
    }
    write_json(report_dir / "reconciliation.json", reconciliation)

    manifest = {
        "exported_at": EXPORTED_AT,
        "source": "SwiftGlass CRM",
        "cutoff": CUTOFF.isoformat(),
        "raw_note": "Raw CSV files contain only the selected migration window plus required master data. Source formatting is preserved; full card numbers are redacted without decoding URL-encoded fields.",
        "files": files_manifest,
        "totals": {
            "orders": len(orders_out),
            "clients": len(client_rows),
            "workers": len(workers_out),
            "order_payments": len(order_payments),
            "finance_movements": len(finance_rows),
            "salary_events": len(salary_rows),
        },
        "ready_for_import": validation["ready_for_import"],
    }
    write_json(report_dir / "manifest.json", manifest)
    archive = None
    if validation["ready_for_import"] and not args.no_archive:
        archive = shutil.make_archive(str(PACKAGE_DIR), "zip", PACKAGE_DIR)

    print(json.dumps({
        "package_dir": str(PACKAGE_DIR),
        "archive": archive,
        "totals": manifest["totals"],
        "issue_counts": reconciliation["issue_counts"],
        "files": len(files_manifest) + 2,
        "ready_for_import": validation["ready_for_import"],
    }, ensure_ascii=False, indent=2))

    if not validation["ready_for_import"]:
        raise SystemExit("Package validation failed; ZIP archive was not created. See reports/validation.json")


def issue(severity, entity_type, legacy_id, code, message, related, data):
    return {
        "severity": severity,
        "entity_type": entity_type,
        "legacy_id": clean(legacy_id),
        "issue_code": code,
        "message": message,
        "related_legacy_id": clean(related),
        "data_json": json.dumps(safe_json_obj(data), ensure_ascii=False, default=str),
    }


def parse_services(value, issues, order_id):
    s = clean(value).strip()
    if not s:
        return []
    try:
        parsed = json.loads(s)
        if isinstance(parsed, list):
            return [{"name": clean(x.get("name") if isinstance(x, dict) else x), "qty": int(x.get("qty", 1)) if isinstance(x, dict) else 1} for x in parsed if clean(x.get("name") if isinstance(x, dict) else x)]
    except json.JSONDecodeError:
        pass
    return [{"name": s, "qty": 1}]


def payment_status_from_cash(cash_row, account_type, payment=None):
    if not cash_row:
        return "pending" if isinstance(payment, dict) and payment.get("confirmed") is False else "posted"
    if clean(cash_row.get("deleted_at")) or clean(cash_row.get("ledger_status")) == "voided":
        return "cancelled"
    if clean(cash_row.get("reversal_of")) or clean(cash_row.get("ledger_status")) == "reversed":
        return "reversed"
    approval = clean(cash_row.get("approval_status"))
    if approval == "pending":
        return "pending"
    if approval in {"confirmed", "not_required", ""}:
        return "posted"
    if approval == "rejected":
        return "rejected"
    return "pending"


def finance_status(c):
    if clean(c.get("deleted_at")) or clean(c.get("ledger_status")) == "voided":
        return "cancelled"
    if clean(c.get("reversal_of")):
        return "reversed"
    if clean(c.get("approval_status")) == "pending":
        return "pending"
    if clean(c.get("approval_status")) == "rejected":
        return "rejected"
    return "posted"


def account_type_from_cash(c):
    if not c:
        return "cash"
    account_type = clean(c.get("account_type")).lower()
    payment_type = clean(c.get("payment_type")).lower()
    text = " ".join([
        clean(c.get("payment_method")),
        clean(c.get("manual_payment_method")),
        clean(c.get("cash_owner")),
        clean(c.get("source_key")),
        clean(c.get("comment")),
    ]).lower()
    if account_type in {"card", "fop"} or payment_type in {"card", "fop"}:
        return "card"
    if "💳" in text or "\u2022\u2022\u2022\u2022" in text or "mono" in text or "privat" in text or "безнал" in text or "фоп" in text:
        return "card"
    return "cash"


def include_confirmed_balance(c):
    return (
        not clean(c.get("deleted_at"))
        and clean(c.get("ledger_status")) != "voided"
        and not truthy(c.get("manual_payment"))
        and clean(c.get("approval_status")) in {"", "confirmed", "not_required"}
    )


def include_pending_balance(c):
    return (
        not clean(c.get("deleted_at"))
        and clean(c.get("ledger_status")) != "voided"
        and not truthy(c.get("manual_payment"))
        and clean(c.get("approval_status")) == "pending"
    )


def operation_type(c, direction):
    if usd_delta(c):
        return "currency_exchange"
    st = clean(c.get("source_type"))
    if st == "exchange":
        return "currency_exchange"
    if st == "salary":
        return "salary_payout" if direction == "out" else "salary_accrual"
    if st == "expense":
        return "expense"
    if st == "dropshipper":
        return "dropshipper_payment"
    if st == "order":
        match = re.search(r"(?:^|\|)type:([^|]+)", clean(c.get("source_key") or c.get("source_id")))
        payment_kind = unquote(match.group(1)).lower() if match else ""
        if payment_kind == "supplier":
            return "supplier_payment"
        if payment_kind == "dropshipper":
            return "dropshipper_payment"
        return "client_payment" if direction == "in" else "supplier_payment"
    if st == "reversal":
        return "reversal"
    if st == "correction":
        return "correction"
    if st == "manual":
        return "income" if direction == "in" else "expense"
    text = clean(c.get("comment")).lower()
    if "поставщ" in text:
        return "supplier_payment"
    if "дроп" in text or "dropship" in text:
        return "dropshipper_payment"
    if "клиент" in text:
        return "client_payment"
    return "income" if direction == "in" else "expense"


def cash_opening_rows(source, cutoff, methods_by_label, worker_name_to_id):
    balances = defaultdict(lambda: {"confirmed": Decimal("0"), "pending": Decimal("0"), "count": 0})
    for row in source:
        if (finance_date(row) or date.min) >= cutoff:
            continue
        include_confirmed = include_confirmed_balance(row)
        include_pending = include_pending_balance(row)
        if not include_confirmed and not include_pending:
            continue
        amount = dec(row.get("amount"))
        key = finance_account_identity(row, methods_by_label, worker_name_to_id, "UAH")
        balances[key]["count"] += 1
        if include_confirmed:
            balances[key]["confirmed"] += amount
        if include_pending:
            balances[key]["pending"] += amount

        usd_amount = usd_delta(row)
        if usd_amount:
            usd_key = ("cash", key[1], "", "", "USD")
            balances[usd_key]["count"] += 1
            if include_confirmed:
                balances[usd_key]["confirmed"] += usd_amount
            if include_pending:
                balances[usd_key]["pending"] += usd_amount

    result = []
    for (account_type, worker_id, method_id, label, currency_code), balance in sorted(balances.items()):
        if balance["confirmed"] == 0 and balance["pending"] == 0:
            continue
        result.append({
            "balance_type": account_type,
            "worker_legacy_id": worker_id,
            "payment_method_legacy_id": method_id,
            "account_type": account_type,
            "currency_code": currency_code,
            "confirmed_amount": out_decimal(balance["confirmed"]),
            "pending_amount": out_decimal(balance["pending"]),
            "calculated_at": cutoff.isoformat(),
            "source_rows_count": str(balance["count"]),
            "metadata_json": json.dumps({"payment_method_label": label}, ensure_ascii=False),
        })
    return result


def debt_opening_rows(source, cutoff):
    totals = {
        "client_receivable": Decimal("0"),
        "supplier_payable": Decimal("0"),
        "dropshipper_payable": Decimal("0"),
    }
    counts = Counter()
    for row in source:
        if (date_value(row.get("date")) or date.min) >= cutoff:
            continue
        if truthy(row.get("is_cancelled")) or bool(clean(row.get("deleted_at"))):
            continue
        debts = {
            "client_receivable": client_total(row) - posted_payment_sum(row, "client_payments", before=cutoff),
            "supplier_payable": dec(row.get("purchase")) - posted_payment_sum(row, "supplier_payments", before=cutoff),
            "dropshipper_payable": dec(row.get("drop_shipper_payout")) - posted_payment_sum(row, "drop_shipper_payments", before=cutoff),
        }
        for kind, amount in debts.items():
            if amount > 0:
                totals[kind] += amount
                counts[kind] += 1

    return [{
        "balance_type": kind,
        "worker_legacy_id": "",
        "payment_method_legacy_id": "",
        "account_type": "",
        "currency_code": "UAH",
        "confirmed_amount": out_decimal(amount),
        "pending_amount": "0",
        "calculated_at": cutoff.isoformat(),
        "source_rows_count": str(counts[kind]),
        "metadata_json": "{}",
    } for kind, amount in totals.items()]


def salary_duplicate_key(row, worker_name_to_id):
    order_id = clean(row.get("order_id"))
    if not order_id.startswith("SG-"):
        return None
    worker_id = clean(row.get("worker_id")) or worker_name_to_id.get(clean(row.get("worker_name")), "")
    return worker_id, order_id, out_decimal(row.get("amount")), date_only(row.get("date"))


def deduplicate_salary_rows(source, worker_name_to_id):
    kept = []
    excluded = []
    first_by_key = {}
    ordered = sorted(source, key=lambda row: (iso_ts(row.get("created_at")), clean(row.get("id"))))
    for row in ordered:
        key = salary_duplicate_key(row, worker_name_to_id)
        if key and key in first_by_key:
            excluded.append((row, first_by_key[key]))
            continue
        if key:
            first_by_key[key] = row
        kept.append(row)
    return kept, excluded


def salary_opening_rows(source, cutoff, worker_name_to_id):
    historical = [row for row in source if (salary_date(row) or date.min) < cutoff]
    historical, _ = deduplicate_salary_rows(historical, worker_name_to_id)
    balances = defaultdict(lambda: {"amount": Decimal("0"), "count": 0, "name": ""})
    for row in historical:
        worker_id = clean(row.get("worker_id")) or worker_name_to_id.get(clean(row.get("worker_name")), "")
        balances[worker_id]["amount"] += dec(row.get("amount"))
        balances[worker_id]["count"] += 1
        balances[worker_id]["name"] = clean(row.get("worker_name"))
    return [{
        "balance_type": "salary_payable",
        "worker_legacy_id": worker_id,
        "payment_method_legacy_id": "",
        "account_type": "",
        "currency_code": "UAH",
        "confirmed_amount": out_decimal(value["amount"]),
        "pending_amount": "0",
        "calculated_at": cutoff.isoformat(),
        "source_rows_count": str(value["count"]),
        "metadata_json": json.dumps({"worker_name": value["name"]}, ensure_ascii=False),
    } for worker_id, value in sorted(balances.items()) if value["amount"] != 0]


def normalize_salary(source, worker_name_to_id, issues):
    rows = []
    original_source = list(source)
    source, excluded_pairs = deduplicate_salary_rows(source, worker_name_to_id)
    duplicate_group_by_id = {}
    duplicate_rows = []
    for index, (excluded, kept) in enumerate(excluded_pairs, start=1):
        group = f"salary_dup:{index}"
        duplicate_group_by_id[clean(kept.get("id"))] = group
        duplicate_rows.append({
            "legacy_salary_id": clean(excluded.get("id")),
            "kept_legacy_salary_id": clean(kept.get("id")),
            "worker_legacy_id": clean(excluded.get("worker_id")) or worker_name_to_id.get(clean(excluded.get("worker_name")), ""),
            "order_legacy_id": clean(excluded.get("order_id")),
            "event_date": date_only(excluded.get("date")),
            "amount": out_decimal(excluded.get("amount")),
            "reason": "duplicate automatic accrual for the same worker, order, amount and date",
        })
        issues.append(issue(
            "warning", "salary_event", clean(excluded.get("id")), "excluded_duplicate_salary",
            "Excluded duplicate automatic order accrual", clean(kept.get("id")), excluded,
        ))
    balances = defaultdict(lambda: {"accrued": Decimal("0"), "paid": Decimal("0"), "corrections": Decimal("0"), "raw": Decimal("0"), "dedup": Decimal("0")})
    for source_row in original_source:
        source_worker_id = clean(source_row.get("worker_id")) or worker_name_to_id.get(clean(source_row.get("worker_name")), "")
        balances[source_worker_id]["raw"] += dec(source_row.get("amount"))
    for r in source:
        worker_id = clean(r.get("worker_id")) or worker_name_to_id.get(clean(r.get("worker_name")), "")
        amount = dec(r.get("amount"))
        comment = clean(r.get("comment"))
        entry = clean(r.get("entry_type")).lower()
        order_id = clean(r.get("order_id"))
        order_lower = order_id.lower()
        comment_lower = comment.lower()
        if order_lower.startswith("отмена зп") or "отмена записи зп" in comment_lower:
            kind = "reversal"
        elif order_lower.startswith("коррекция зп") or "коррекц" in comment_lower:
            kind = "correction"
        elif order_lower.startswith("выплата"):
            kind = "payout"
        elif order_id in {"Выход в работу", "Ставка за день"}:
            kind = "attendance"
        elif order_id.startswith("SG-"):
            kind = "order_accrual"
        elif amount < 0:
            kind = "payout"
        else:
            kind = "manual_accrual" if amount >= 0 else "correction"
        dup_group = duplicate_group_by_id.get(clean(r.get("id")), "")
        suspected = bool(dup_group)
        balances[worker_id]["dedup"] += amount
        if kind in {"order_accrual", "attendance", "manual_accrual"} and amount > 0:
            balances[worker_id]["accrued"] += amount
        elif kind == "payout":
            balances[worker_id]["paid"] += abs(amount)
        else:
            balances[worker_id]["corrections"] += amount
        rows.append({
            "legacy_salary_id": clean(r.get("id")),
            "worker_legacy_id": worker_id,
            "worker_name": clean(r.get("worker_name")),
            "event_date": date_only(r.get("date")),
            "occurred_at": iso_ts(r.get("created_at")),
            "signed_amount": out_decimal(amount),
            "event_kind": kind,
            "order_legacy_id": order_id,
            "source_key": f"salary:{clean(r.get('id'))}",
            "comment": comment,
            "created_by": clean(r.get("created_by")),
            "edit_history_json": json.dumps(parse_json_field(r.get("edit_history"), []), ensure_ascii=False),
            "suspected_duplicate": str(suspected).lower(),
            "duplicate_group_key": dup_group,
            "legacy_payload_json": json.dumps(safe_json_obj(r), ensure_ascii=False),
        })
    bal_rows = []
    for worker_id, b in sorted(balances.items()):
        bal_rows.append({
            "worker_legacy_id": worker_id,
            "accrued_total": out_decimal(b["accrued"]),
            "paid_total": out_decimal(b["paid"]),
            "corrections_total": out_decimal(b["corrections"]),
            "current_balance_raw": out_decimal(b["raw"]),
            "current_balance_without_suspected_duplicates": out_decimal(b["dedup"]),
            "calculated_at": EXPORTED_AT,
        })
    return rows, bal_rows, duplicate_rows


def copy_simple_dirs(norm_dir, rows, all_cash):
    transforms = {
        "car_directory": ("car_directory.csv", ["legacy_id", "model", "eurocode"], lambda r: {"legacy_id": clean(r.get("id")), "model": clean(r.get("model")), "eurocode": clean(r.get("eurocode"))}),
        "ref_service_rates": ("service_rates.csv", ["legacy_id", "service_group", "name", "salary_rate", "sale_price", "salary_category", "active", "sort_order", "created_at", "updated_at"], lambda r: {"legacy_id": clean(r.get("id")), "service_group": clean(r.get("service_group")), "name": clean(r.get("name")), "salary_rate": out_decimal(r.get("rate")), "sale_price": "", "salary_category": clean(r.get("salary_category")), "active": str(truthy(r.get("active"))).lower(), "sort_order": clean(r.get("sort_order")), "created_at": iso_ts(r.get("created_at")), "updated_at": iso_ts(r.get("updated_at"))}),
        "ref_warehouses": ("warehouses.csv", ["legacy_id", "name", "created_at"], lambda r: {"legacy_id": clean(r.get("id")), "name": clean(r.get("name")), "created_at": iso_ts(r.get("created_at"))}),
        "ref_payment_statuses": ("payment_statuses.csv", ["legacy_id", "name", "created_at"], lambda r: {"legacy_id": clean(r.get("id")), "name": clean(r.get("name")), "created_at": iso_ts(r.get("created_at"))}),
        "ref_supplier_statuses": ("supplier_statuses.csv", ["legacy_id", "name", "created_at"], lambda r: {"legacy_id": clean(r.get("id")), "name": clean(r.get("name")), "created_at": iso_ts(r.get("created_at"))}),
    }
    for table, (filename, fields, fn) in transforms.items():
        write_csv(norm_dir / filename, [fn(r) for r in rows[table]], fields)
    cats = [
        {"legacy_id": "income:other", "category_type": "income", "name": "Прочее", "requires_warehouse": "false", "active": "true", "sort_order": "100"},
        {"legacy_id": "expense:other", "category_type": "expense", "name": "Прочее", "requires_warehouse": "false", "active": "true", "sort_order": "100"},
    ]
    expense_names = sorted({clean(row.get("expense_category")).strip() for row in all_cash if clean(row.get("expense_category")).strip()})
    for index, name in enumerate(expense_names, start=1):
        slug = hashlib.sha256(name.lower().encode("utf-8")).hexdigest()[:12]
        cats.append({
            "legacy_id": f"expense:{slug}",
            "category_type": "expense",
            "name": name,
            "requires_warehouse": str(any(
                clean(row.get("expense_category")).strip() == name and clean(row.get("warehouse_name"))
                for row in all_cash
            )).lower(),
            "active": "true",
            "sort_order": str(100 + index * 10),
        })
    write_csv(norm_dir / "finance_categories.csv", cats, ["legacy_id", "category_type", "name", "requires_warehouse", "active", "sort_order"])


def normalize_app_settings(path, settings, issues):
    out = {}
    for r in settings:
        key = clean(r.get("key"))
        if SECRET_KEY.search(key):
            issues.append(issue("warning", "app_setting", clean(r.get("id")), "secret_setting_skipped", f"Skipped setting key {key}", "", r))
            continue
        out[key] = parse_json_field(r.get("value_json"), clean(r.get("value_json")))
    write_json(path, safe_json_obj(out))


def normalize_worker_problems(norm_dir, problems, worker_name_to_id, order_ids, issues):
    out = []
    for r in problems:
        worker_id = worker_name_to_id.get(clean(r.get("worker_name")), "")
        partner_id = worker_name_to_id.get(clean(r.get("partner")), "")
        order_id = clean(r.get("order_id"))
        if not worker_id:
            issues.append(issue("warning", "worker_problem", clean(r.get("id")), "missing_worker", "worker_name was not matched to workers table", "", r))
        if order_id and order_id not in order_ids:
            issues.append(issue("warning", "worker_problem", clean(r.get("id")), "missing_order", "Problem references missing order", order_id, r))
        out.append({
            "legacy_problem_id": clean(r.get("id")),
            "worker_legacy_id": worker_id,
            "worker_name": clean(r.get("worker_name")),
            "partner_worker_legacy_id": partner_id,
            "date": date_only(r.get("date")),
            "amount": out_decimal(r.get("amount")),
            "order_legacy_id": order_id,
            "comment": clean(r.get("description")),
            "created_at": iso_ts(r.get("created_at")),
            "legacy_payload_json": json.dumps(safe_json_obj(r), ensure_ascii=False),
        })
    write_csv(norm_dir / "worker_problems.csv", out, [
        "legacy_problem_id", "worker_legacy_id", "worker_name", "partner_worker_legacy_id", "date",
        "amount", "order_legacy_id", "comment", "created_at", "legacy_payload_json"
    ])


def count_rows(path):
    if path.suffix == ".json":
        return 1
    with open(path, newline="", encoding="utf-8") as f:
        return max(0, sum(1 for _ in csv.reader(f)) - 1)


def duplicate_count(rows, key_fields):
    keys = [tuple(clean(row.get(field)) for field in key_fields) for row in rows]
    return len(keys) - len(set(keys))


def validate_package_data(
    orders, clients, workers, methods, payments, finance_movements, opening_balances, salary_events, issues,
    expected_cash_balances, expected_salary_balances, expected_debts, selected_debts,
):
    order_ids = {row["legacy_order_id"] for row in orders}
    client_ids = {row["legacy_client_id"] for row in clients}
    worker_ids = {row["legacy_worker_id"] for row in workers}
    method_ids = {row["legacy_payment_method_id"] for row in methods}
    checks = []

    def add(name, ok, details):
        checks.append({"name": name, "ok": bool(ok), "details": details})

    add("orders_have_unique_ids", duplicate_count(orders, ["legacy_order_id"]) == 0, {"rows": len(orders)})
    add("clients_have_unique_ids", duplicate_count(clients, ["legacy_client_id"]) == 0, {"rows": len(clients)})
    add("workers_have_unique_ids", duplicate_count(workers, ["legacy_worker_id"]) == 0, {"rows": len(workers)})
    add(
        "orders_reference_existing_clients",
        all(row["client_legacy_id"] in client_ids for row in orders),
        {"missing": sum(row["client_legacy_id"] not in client_ids for row in orders)},
    )
    order_worker_fields = [
        "responsible_worker_legacy_id", "assistant_worker_legacy_id", "extra_assistant_worker_legacy_id",
        "manager_worker_legacy_id", "tatu_worker_legacy_id", "toning_worker_legacy_id",
        "dropshipper_worker_legacy_id",
    ]
    missing_worker_refs = sum(
        bool(clean(row.get(field))) and clean(row.get(field)) not in worker_ids
        for row in orders for field in order_worker_fields
    )
    add("orders_reference_existing_workers", missing_worker_refs == 0, {"missing": missing_worker_refs})
    add(
        "payments_reference_imported_orders",
        all(row["order_legacy_id"] in order_ids for row in payments),
        {"missing": sum(row["order_legacy_id"] not in order_ids for row in payments)},
    )
    add(
        "finance_movements_have_unique_ids",
        duplicate_count(finance_movements, ["legacy_movement_id"]) == 0,
        {"rows": len(finance_movements)},
    )
    opening_identity = [
        (row["balance_type"], row["worker_legacy_id"], row["payment_method_legacy_id"], row["currency_code"])
        for row in opening_balances
    ]
    add(
        "opening_balance_identities_are_unique",
        len(opening_identity) == len(set(opening_identity)),
        {"duplicates": len(opening_identity) - len(set(opening_identity))},
    )
    invalid_cards = [
        row for row in opening_balances
        if row["balance_type"] == "card" and (
            row["worker_legacy_id"] not in worker_ids or row["payment_method_legacy_id"] not in method_ids
        )
    ]
    add("card_opening_balances_have_owner_and_method", not invalid_cards, {"invalid": len(invalid_cards)})
    add(
        "salary_events_have_unique_source_ids",
        duplicate_count(salary_events, ["legacy_salary_id"]) == 0,
        {"rows": len(salary_events)},
    )
    add(
        "currency_exchanges_have_usd_leg",
        all(row["secondary_currency_code"] == "USD" and dec(row["secondary_signed_amount"]) != 0
            for row in finance_movements if row["operation_type"] == "currency_exchange"),
        {"operations": sum(row["operation_type"] == "currency_exchange" for row in finance_movements)},
    )

    def balance_map(source, balance_types):
        return {
            (row["balance_type"], row["worker_legacy_id"], row["payment_method_legacy_id"], row["currency_code"]): (
                dec(row["confirmed_amount"]), dec(row["pending_amount"])
            )
            for row in source if row["balance_type"] in balance_types
        }

    rolled_cash = defaultdict(lambda: [Decimal("0"), Decimal("0")])
    for key, amounts in balance_map(opening_balances, {"cash", "card"}).items():
        rolled_cash[key][0] += amounts[0]
        rolled_cash[key][1] += amounts[1]
    for movement in finance_movements:
        key = (
            movement["account_type"], movement["cash_worker_legacy_id"],
            movement["payment_method_legacy_id"] if movement["account_type"] == "card" else "", "UAH",
        )
        if truthy(movement["include_in_confirmed_balance"]):
            rolled_cash[key][0] += dec(movement["signed_amount"])
        if truthy(movement["include_in_pending_balance"]):
            rolled_cash[key][1] += dec(movement["signed_amount"])
        if clean(movement["secondary_currency_code"]) == "USD":
            usd_key = ("cash", movement["cash_worker_legacy_id"], "", "USD")
            if truthy(movement["include_in_confirmed_balance"]):
                rolled_cash[usd_key][0] += dec(movement["secondary_signed_amount"])
            if truthy(movement["include_in_pending_balance"]):
                rolled_cash[usd_key][1] += dec(movement["secondary_signed_amount"])
    rolled_cash = {key: tuple(value) for key, value in rolled_cash.items() if value != [Decimal("0"), Decimal("0")]}
    expected_cash = balance_map(expected_cash_balances, {"cash", "card"})
    cash_differences = sorted(set(rolled_cash) | set(expected_cash))
    cash_differences = [key for key in cash_differences if rolled_cash.get(key, (Decimal("0"), Decimal("0"))) != expected_cash.get(key, (Decimal("0"), Decimal("0")))]
    add("cash_opening_plus_period_equals_full_history", not cash_differences, {"differences": len(cash_differences)})

    opening_salary = balance_map(opening_balances, {"salary_payable"})
    expected_salary = balance_map(expected_salary_balances, {"salary_payable"})
    rolled_salary = defaultdict(Decimal)
    for key, amounts in opening_salary.items():
        rolled_salary[key] += amounts[0]
    for event in salary_events:
        key = ("salary_payable", event["worker_legacy_id"], "", "UAH")
        rolled_salary[key] += dec(event["signed_amount"])
    rolled_salary = {key: value for key, value in rolled_salary.items() if value != 0}
    expected_salary_amounts = {key: value[0] for key, value in expected_salary.items() if value[0] != 0}
    salary_differences = [
        key for key in sorted(set(rolled_salary) | set(expected_salary_amounts))
        if rolled_salary.get(key, Decimal("0")) != expected_salary_amounts.get(key, Decimal("0"))
    ]
    add("salary_opening_plus_period_equals_full_history", not salary_differences, {"differences": len(salary_differences)})

    expected_debt_map = balance_map(expected_debts, {"client_receivable", "supplier_payable", "dropshipper_payable"})
    selected_debt_map = balance_map(selected_debts, {"client_receivable", "supplier_payable", "dropshipper_payable"})
    add(
        "all_current_debts_are_preserved_by_selected_orders",
        expected_debt_map == selected_debt_map,
        {"differences": sum(
            expected_debt_map.get(key) != selected_debt_map.get(key)
            for key in set(expected_debt_map) | set(selected_debt_map)
        )},
    )
    error_issues = sum(issue_row["severity"] == "error" for issue_row in issues)
    add("no_blocking_migration_issues", error_issues == 0, {"errors": error_issues})
    return {
        "ready_for_import": all(check["ok"] for check in checks),
        "checks": checks,
    }


if __name__ == "__main__":
    main()
