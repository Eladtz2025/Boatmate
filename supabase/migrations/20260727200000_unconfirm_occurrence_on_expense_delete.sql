-- ============================================================================
-- BUG FIX: a confirmed standing-order payment could never be deleted.
--
-- recurring_occurrences.expense_id is `on delete set null`, while
-- recurring_occurrence_paid_has_expense requires:
--
--     (status = 'paid'  and expense_id is not null)
--  or (status <> 'paid' and expense_id is null)
--
-- so deleting the expense nulled the column out from under a 'paid' row and
-- tripped the check:
--
--   23514: new row for relation "recurring_occurrences" violates check
--          constraint "recurring_occurrence_paid_has_expense"
--
-- deleteExpense() surfaced that raw Postgres error to the user, and there was
-- no way to undo a payment confirmed by mistake short of editing the database.
--
-- The fix restores the intended meaning: the expense IS the payment, so
-- deleting it un-confirms the occurrence and puts it back in the pending list,
-- where it can be confirmed again. A BEFORE DELETE trigger clears the link
-- first, so the foreign key's SET NULL has nothing left to violate.
--
-- CHECK constraints cannot be DEFERRABLE in Postgres, so ordering is the only
-- lever available here.
-- ============================================================================

create or replace function public.unconfirm_occurrence_on_expense_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recurring_occurrences
     set status     = 'pending',
         expense_id = null
   where expense_id = old.id;

  return old;
end;
$$;

drop trigger if exists trg_expense_delete_unconfirms_occurrence on public.expenses;

create trigger trg_expense_delete_unconfirms_occurrence
  before delete on public.expenses
  for each row execute function public.unconfirm_occurrence_on_expense_delete();
