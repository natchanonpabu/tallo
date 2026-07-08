// Thin client over the Go REST API (design.md #5). Every mutation returns the
// full month; callers replace local state with it (design.md #7). Amounts are
// satang integers end-to-end.

const BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080/api";

export type ExpenseStatus = "pending" | "paid";
export type IncomeStatus = "pending" | "received";
export type PersonStatus = "pending" | "settled";

export interface Expense {
  id: string;
  group: string;
  name: string;
  amount: number;
  minimum: number;
  custom: number;
  status: ExpenseStatus;
  position: number;
}

export interface Income {
  id: string;
  name: string;
  amount: number;
  status: IncomeStatus;
  position: number;
}

export interface Entry {
  id: string;
  label: string;
  amount: number;
  sourceExpenseId: string | null;
}

export interface Person {
  id: string;
  name: string;
  status: PersonStatus;
  net: number;
  position: number;
  entries: Entry[];
}

export interface Summary {
  paid: number;
  toPay: number;
  received: number;
  toReceive: number;
  cashNow: number;
}

export interface Month {
  id: string;
  label: string;
  createdAt: string;
  expenses: Expense[];
  incomes: Income[];
  people: Person[];
  summary: Summary;
}

export interface MonthListItem {
  id: string;
  label: string;
  createdAt: string;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "error",
      err?.message ?? "เกิดข้อผิดพลาด",
    );
  }
  return data as T;
}

// --- Split request (design.md #5) ---
export interface SplitParticipant {
  name: string;
  amount?: number; // manual mode only
}
export interface SplitRequest {
  mode: "even" | "manual";
  includeMe?: boolean;
  participants: SplitParticipant[];
}

export const api = {
  // Months
  listMonths: () => request<MonthListItem[]>("GET", "/months"),
  getMonth: (id: string) => request<Month>("GET", `/months/${id}`),
  createMonth: (label: string) => request<Month>("POST", "/months", { label }),
  deleteMonth: (id: string) => request<void>("DELETE", `/months/${id}`),
  cloneMonth: (id: string, body: { label: string; expenseIds: string[]; incomeIds: string[] }) =>
    request<Month>("POST", `/months/${id}/clone`, body),

  // Expenses
  createExpense: (monthId: string, body: Partial<Omit<Expense, "id" | "status" | "position">>) =>
    request<Month>("POST", `/months/${monthId}/expenses`, body),
  updateExpense: (id: string, body: Partial<Pick<Expense, "group" | "name" | "amount" | "minimum" | "custom" | "status" | "position">>) =>
    request<Month>("PATCH", `/expenses/${id}`, body),
  deleteExpense: (id: string) => request<Month>("DELETE", `/expenses/${id}`),
  splitExpense: (id: string, body: SplitRequest) =>
    request<Month>("POST", `/expenses/${id}/split`, body),

  // Incomes
  createIncome: (monthId: string, body: { name?: string; amount?: number }) =>
    request<Month>("POST", `/months/${monthId}/incomes`, body),
  updateIncome: (id: string, body: Partial<Pick<Income, "name" | "amount" | "status" | "position">>) =>
    request<Month>("PATCH", `/incomes/${id}`, body),
  deleteIncome: (id: string) => request<Month>("DELETE", `/incomes/${id}`),

  // People + ledger
  createPerson: (monthId: string, name: string) =>
    request<Month>("POST", `/months/${monthId}/people`, { name }),
  updatePerson: (id: string, body: Partial<Pick<Person, "name" | "status" | "position">>) =>
    request<Month>("PATCH", `/people/${id}`, body),
  deletePerson: (id: string) => request<Month>("DELETE", `/people/${id}`),
  createEntry: (personId: string, body: { label?: string; amount: number }) =>
    request<Month>("POST", `/people/${personId}/entries`, body),
  updateEntry: (id: string, body: Partial<Pick<Entry, "label" | "amount">>) =>
    request<Month>("PATCH", `/entries/${id}`, body),
  deleteEntry: (id: string) => request<Month>("DELETE", `/entries/${id}`),
};
