import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { format } from "date-fns";
import { getDashboardData } from "@/lib/analytics.functions";
import { getBudgetProgress } from "@/lib/budgets.functions";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  CalendarIcon,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Finance AI" }] }),
});

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

const RANGES = [
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
  { label: "6 meses", value: 180 },
  { label: "1 ano", value: 365 },
  { label: "Tudo", value: 3650 },
];

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
  "var(--success)",
  "var(--warning)",
];

type RangeMode = "preset" | "custom";

function Dashboard() {
  const [mode, setMode] = useState<RangeMode>("preset");
  const [days, setDays] = useState(90);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [startDate, setStartDate] = useState<Date | undefined>(thirtyDaysAgo);
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  const fetchData = useServerFn(getDashboardData);
  const opts = queryOptions({
    queryKey:
      mode === "preset"
        ? ["dashboard", "preset", days]
        : [
            "dashboard",
            "custom",
            startDate!.toISOString().slice(0, 10),
            endDate!.toISOString().slice(0, 10),
          ],
    queryFn: () =>
      mode === "preset"
        ? fetchData({ data: { days } })
        : fetchData({
            data: {
              startDate: startDate!.toISOString().slice(0, 10),
              endDate: endDate!.toISOString().slice(0, 10),
            },
          }),
    enabled: mode === "preset" || (!!startDate && !!endDate),
  });
  const { data, isLoading } = useQuery(opts);

  const fetchBudget = useServerFn(getBudgetProgress);
  const { data: budget } = useQuery({
    queryKey: ["budget-progress", "current"],
    queryFn: () => fetchBudget({ data: {} }),
  });

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
            Central financeira
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Visão geral</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Seu panorama financeiro em tempo real.
          </p>
        </div>
        <RangeSelector
          mode={mode}
          days={days}
          startDate={startDate}
          endDate={endDate}
          setMode={setMode}
          setDays={setDays}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
        />
      </header>

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : data.txCount === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={Wallet}
              label="Saldo"
              value={fmtBRL(data.totals.balance)}
              accent={data.totals.balance >= 0 ? "success" : "destructive"}
              featured
            />
            <Stat
              icon={TrendingUp}
              label="Receitas"
              value={fmtBRL(data.totals.income)}
              accent="success"
            />
            <Stat
              icon={TrendingDown}
              label="Despesas"
              value={fmtBRL(data.totals.expense)}
              accent="destructive"
            />
            <ScoreStat score={data.totals.score} />
          </section>

          <section className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
            <div className="surface-card surface-card-hover overflow-hidden p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Fluxo financeiro
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">Evolução financeira</h2>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <LegendDot label="Receitas" className="bg-success" />
                  <LegendDot label="Despesas" className="bg-destructive" />
                </div>
              </div>
              <div className="h-[300px] sm:h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.series} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g-income" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g-expense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.24} />
                        <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 6" />
                    <XAxis
                      axisLine={false}
                      tickLine={false}
                      dataKey="date"
                      tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                      tickFormatter={fmtDate}
                      minTickGap={28}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                      tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--primary)", strokeOpacity: 0.18 }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        boxShadow: "0 16px 40px oklch(0 0 0 / .24)",
                      }}
                      labelStyle={{ color: "var(--foreground)", fontWeight: 600, marginBottom: 5 }}
                      labelFormatter={(l) => new Date(l).toLocaleDateString("pt-BR")}
                      formatter={(v: number) => fmtBRL(v)}
                    />
                    <Area
                      type="monotone"
                      dataKey="income"
                      stroke="var(--chart-2)"
                      strokeWidth={2.5}
                      fill="url(#g-income)"
                      name="Receitas"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="expense"
                      stroke="var(--chart-5)"
                      strokeWidth={2.5}
                      fill="url(#g-expense)"
                      name="Despesas"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <CategoryCard categories={data.categories} />
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
            <div className="surface-card overflow-hidden p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Movimentações
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">Maiores gastos</h2>
                </div>
                <Link
                  to="/transactions"
                  className="group flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Ver todas{" "}
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-3 text-left font-medium">Data</th>
                      <th className="py-3 text-left font-medium">Descrição</th>
                      <th className="py-3 text-left font-medium">Categoria</th>
                      <th className="py-3 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topExpenses.map((t, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/50 transition-colors last:border-0 hover:bg-white/[0.025]"
                      >
                        <td className="py-3.5 text-muted-foreground">{fmtDate(t.date)}</td>
                        <td className="max-w-[260px] truncate py-3.5 font-medium">
                          {t.description}
                        </td>
                        <td className="py-3.5">
                          <span className="inline-flex rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 text-[11px] text-muted-foreground">
                            {t.category}
                          </span>
                        </td>
                        <td className="py-3.5 text-right font-semibold text-destructive">
                          {fmtBRL(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-5">
              <div className="surface-card p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15">
                    <Sparkles className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
                      Inteligência
                    </p>
                    <h2 className="mt-0.5 text-lg font-semibold">Consultor IA</h2>
                  </div>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Transforme seus dados financeiros em decisões mais claras com uma análise
                  personalizada.
                </p>
                <Link
                  to="/insights"
                  className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  Ver análise <ArrowRight className="size-4" />
                </Link>
              </div>

              <FlowCard data={data} />
            </div>
          </section>

          {budget && budget.rows.length > 0 && <BudgetCard budget={budget} />}
        </>
      )}
    </div>
  );
}

function RangeSelector({
  mode,
  days,
  startDate,
  endDate,
  setMode,
  setDays,
  setStartDate,
  setEndDate,
}: any) {
  return (
    <div className="surface-card w-full p-1.5 xl:w-auto">
      <div className="flex flex-wrap items-center gap-1">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => {
              setMode("preset");
              setDays(r.value);
            }}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-medium transition",
              mode === "preset" && days === r.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={() => {
            if (mode === "preset") {
              const start = new Date();
              start.setDate(start.getDate() - days);
              setStartDate(start);
              setEndDate(new Date());
            }
            setMode("custom");
          }}
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-medium transition",
            mode === "custom"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
          )}
        >
          Personalizado
        </button>
        {mode === "custom" && (
          <div className="flex w-full items-center gap-2 border-t border-border px-1 pt-1.5 sm:w-auto sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
            <DatePicker date={startDate} onChange={setStartDate} label="De" />
            <span className="text-xs text-muted-foreground">até</span>
            <DatePicker date={endDate} onChange={setEndDate} label="Até" />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
  featured = false,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  accent: "success" | "destructive" | "primary";
  featured?: boolean;
}) {
  const colorMap = {
    success: "text-success bg-success/10 ring-success/15",
    destructive: "text-destructive bg-destructive/10 ring-destructive/15",
    primary: "text-primary bg-primary/10 ring-primary/15",
  } as const;
  return (
    <div
      className={cn(
        "surface-card surface-card-hover relative overflow-hidden p-5",
        featured && "border-primary/20",
      )}
    >
      {featured && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">{value}</p>
        </div>
        <div
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl ring-1",
            colorMap[accent],
          )}
        >
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

function ScoreStat({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="surface-card surface-card-hover p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Score financeiro
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {score}
            <span className="text-sm font-medium text-muted-foreground">/100</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Saúde financeira</p>
        </div>
        <div
          className="relative grid size-14 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--primary) ${clamped * 3.6}deg, var(--border) 0deg)`,
          }}
        >
          <div className="grid size-11 place-items-center rounded-full bg-card text-xs font-semibold">
            {clamped}%
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ categories }: { categories: Array<{ name: string; value: number }> }) {
  const top = categories.slice(0, 6);
  const total = top.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="surface-card p-5 sm:p-6">
      <div className="mb-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Distribuição
        </p>
        <h2 className="mt-1 text-lg font-semibold">Gastos por categoria</h2>
      </div>
      <div className="relative mx-auto h-[205px] max-w-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={top}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={3}
              stroke="transparent"
            >
              {top.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 14,
              }}
              formatter={(v: number) => fmtBRL(v)}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="mt-0.5 text-base font-semibold">{fmtBRL(total)}</p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {top.slice(0, 5).map((item, i) => (
          <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              <span className="truncate text-muted-foreground">{item.name}</span>
            </div>
            <span className="font-medium">
              {total ? Math.round((item.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowCard({ data }: { data: any }) {
  return (
    <div className="surface-card p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Período atual
        </p>
        <h2 className="mt-1 text-lg font-semibold">Fluxo do mês</h2>
      </div>
      <div className="space-y-4">
        <FlowRow
          icon={ArrowUpRight}
          label="Entradas"
          value={fmtBRL(data.totals.monthIncome)}
          color="text-success"
        />
        <FlowRow
          icon={ArrowDownRight}
          label="Saídas"
          value={fmtBRL(data.totals.monthExpense)}
          color="text-destructive"
        />
        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Resultado do mês</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold",
              data.totals.monthBalance >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {fmtBRL(data.totals.monthBalance)}
          </p>
        </div>
      </div>
    </div>
  );
}

function FlowRow({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof ArrowUpRight;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span className="grid size-8 place-items-center rounded-lg bg-white/[0.035] ring-1 ring-border">
          <Icon className={cn("size-4", color)} />
        </span>
        {label}
      </div>
      <span className={cn("font-semibold", color)}>{value}</span>
    </div>
  );
}

function BudgetCard({ budget }: { budget: any }) {
  return (
    <section className="surface-card mt-5 p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Target className="size-4" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Planejamento
            </p>
            <h2 className="mt-0.5 text-lg font-semibold">Planejamento do mês</h2>
          </div>
        </div>
        <Link to="/planning" className="text-xs font-medium text-primary hover:underline">
          Gerenciar
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {budget.rows
          .slice()
          .sort((a: any, b: any) => b.pct - a.pct)
          .slice(0, 6)
          .map((r: any) => {
            const pct = Math.min(100, r.pct);
            return (
              <div key={r.id}>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    {r.over && <AlertTriangle className="size-3 text-destructive" />}
                    {r.category}
                  </span>
                  <span
                    className={r.over ? "font-medium text-destructive" : "text-muted-foreground"}
                  >
                    {fmtBRL(r.spent)} / {fmtBRL(r.planned)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      r.over ? "bg-destructive" : pct > 80 ? "bg-warning" : "bg-primary",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}

function LegendDot({ label, className }: { label: string; className: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}

function DatePicker({
  date,
  onChange,
  label,
}: {
  date: Date | undefined;
  onChange: (d: Date | undefined) => void;
  label: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={label}
          className={cn(
            "h-8 min-w-[106px] justify-start px-2 text-left text-xs font-normal",
            !date && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-1 size-3.5" />
          {date ? format(date, "dd/MM/yyyy") : <span>{label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onChange}
          initialFocus
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface-card h-28" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.65fr_.85fr]">
        <div className="surface-card h-[390px]" />
        <div className="surface-card h-[390px]" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="surface-card mx-auto max-w-xl p-10 text-center sm:p-14">
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
        <Wallet className="size-6" />
      </div>
      <h3 className="text-xl font-semibold">Nenhuma transação ainda</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Importe um arquivo OFX, CSV, XLSX, PDF ou imagem para começar a construir seu panorama
        financeiro.
      </p>
      <Link
        to="/import"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        Ir para Importar <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
