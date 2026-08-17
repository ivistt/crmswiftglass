import importlib.util
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build_migration_package.py")
SPEC = importlib.util.spec_from_file_location("build_migration_package", MODULE_PATH)
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


class MigrationBuilderTest(unittest.TestCase):
    def test_client_total_includes_income_and_delivery(self):
        row = {"total": "100", "income": "20", "delivery": "30"}
        self.assertEqual(builder.client_total(row), Decimal("150"))

    def test_missing_payment_confirmation_is_legacy_posted(self):
        row = {"client_payments": '[{"amount": 125, "date": "2026-06-01"}]'}
        self.assertEqual(builder.posted_payment_sum(row, "client_payments"), Decimal("125"))

    def test_explicit_pending_payment_is_not_posted(self):
        row = {"client_payments": '[{"amount": 125, "confirmed": false}]'}
        self.assertEqual(builder.posted_payment_sum(row, "client_payments"), Decimal("0"))

    def test_transfer_is_not_automatically_a_card(self):
        row = {
            "account_type": "cash",
            "payment_type": "transfer",
            "payment_method": "",
            "manual_payment_method": "",
            "cash_owner": "Worker",
            "source_key": "",
            "comment": "FXUSD|usd=100|rate=40|uah=4000|note=",
        }
        self.assertEqual(builder.account_type_from_cash(row), "cash")

    def test_currency_exchange_keeps_both_currency_legs(self):
        row = {
            "source_type": "exchange",
            "comment": "FXUSD|usd=-100.50|rate=40|uah=4020|note=",
        }
        self.assertEqual(builder.usd_delta(row), Decimal("-100.50"))
        self.assertEqual(builder.operation_type(row, "in"), "currency_exchange")

    def test_old_unpaid_order_is_carried_forward(self):
        row = {
            "date": "2026-05-01",
            "total": "1000",
            "income": "0",
            "delivery": "0",
            "purchase": "0",
            "drop_shipper_payout": "0",
            "client_payments": "[]",
            "supplier_payments": "[]",
            "drop_shipper_payments": "[]",
            "is_cancelled": "false",
            "deleted_at": "null",
            "worker_done": "true",
            "status_done": "false",
        }
        self.assertIn("client_debt", builder.order_carry_reasons(row, date(2026, 6, 15)))


if __name__ == "__main__":
    unittest.main()
