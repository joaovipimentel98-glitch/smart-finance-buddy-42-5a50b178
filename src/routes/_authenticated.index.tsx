import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { format } from "date-fns";
import { getDashboardData } from "@/lib/analytics.functions";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Wallet, Target, Sparkles, ArrowUpRight, ArrowDownRight, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Finance AI" }] }),
});

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
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
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)",
  "oklch(0.7 0.18 320)", "oklch(0.7 0.18 180)", "oklch(0.7 0.18 50)",
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
        : ["dashboard", "custom", startDate!.toISOString().slice(0, 10), endDate!.toISOString().slice(0, 10)],
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

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-8 flex items-start md:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground mt-1">Seu panorama financeiro em tempo real.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 surface-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => {
                setMode("preset");
                setDays(r.value);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs transition ${
                mode === "preset" && days === r.value
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
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
            className={`px-3 py-1.5 rounded-lg text-xs transition ${
              mode === "custom"
                ? "bg-primary/20 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Personalizado
          </button>
          {mode === "custom" && (
            <div className="flex items-center gap-2 pl-2 border-l border-border w-full md:w-auto">
              <DatePicker date={startDate} onChange={setStartDate} label="De" />
              <span className="text-muted-foreground text-xs">até</span>
              <DatePicker date={endDate} onChange={setEndDate} label="Até" />
            </div>
          )}
        </div>
      </header>

      {isLoading || !data ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : data.txCount === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Stat icon={TrendingUp} label="Receita" value={fmtBRL(data.totals.income)} accent="success" />
            <Stat icon={TrendingDown} label="Despesa" value={fmtBRL(data.totals.expense)} accent="destructive" />
            <Stat icon={Wallet} label="Saldo" value={fmtBRL(data.totals.balance)} accent={data.totals.balance >= 0 ? "success" : "destructive"} />
            <Stat icon={Target} label="Score Financeiro" value={`${data.totals.score}/100`} accent="primary" />
          </section>

          <section className="grid lg:grid-cols-3 gap-4 mb-6">
            <div className="surface-card p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Evolução financeira</h2>
                <Sparkles className="size-4 text-primary" />
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.series}>
                    <defs>
                      <linearGradient id="g-income" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g-expense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" />
                    <XAxis dataKey="date" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} tickFormatter={fmtDate} />
                    <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                      labelFormatter={(l) => new Date(l).toLocaleDateString("pt-BR")}
                      formatter={(v: number) => fmtBRL(v)}
                    />
                    <Area type="monotone" dataKey="income" stroke="var(--chart-2)" fill="url(#g-income)" name="Receita" />
                    <Area type="monotone" dataKey="expense" stroke="var(--chart-5)" fill="url(#g-expense)" name="Despesa" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="surface-card p-6">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Gastos por categoria</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.categories.slice(0, 8)} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
                      {data.categories.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                      formatter={(v: number) => fmtBRL(v)}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="grid lg:grid-cols-3 gap-4">
            <div className="surface-card p-6 lg:col-span-2">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Maiores gastos</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left py-2 font-medium">Data</th>
                      <th className="text-left py-2 font-medium">Descrição</th>
                      <th className="text-left py-2 font-medium">Categoria</th>
                      <th className="text-right py-2 font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topExpenses.map((t, i) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="py-3 text-muted-foreground">{fmtDate(t.date)}</td>
                        <td className="py-3 max-w-xs truncate">{t.description}</td>
                        <td className="py-3"><span className="text-xs px-2 py-0.5 rounded-md bg-accent/30 text-accent-foreground">{t.category}</span></td>
                        <td className="py-3 text-right font-medium text-destructive">{fmtBRL(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="surface-card p-6">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Fluxo do mês</h2>
              <div className="space-y-4">
                <FlowRow icon={ArrowUpRight} label="Entradas" value={fmtBRL(data.totals.monthIncome)} color="text-success" />
                <FlowRow icon={ArrowDownRight} label="Saídas" value={fmtBRL(data.totals.monthExpense)} color="text-destructive" />
                <div className="pt-4 border-t border-border">
                  <div className="text-xs text-muted-foreground mb-1">Resultado do mês</div>
                  <div className={`text-2xl font-semibold ${data.totals.monthBalance >= 0 ? "text-success" : "text-destructive"}`}>
                    {fmtBRL(data.totals.monthBalance)}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
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
            "h-8 px-2 justify-start text-left text-xs font-normal min-w-[110px]",
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

function Stat({ icon: Icon, label, value, accent }: { icon: typeof Wallet; label: string; value: string; accent: "success" | "destructive" | "primary" }) {
  const colorMap = {
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
    primary: "text-primary bg-primary/10",
  } as const;
  return (
    <div className="surface-card surface-card-hover p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-semibold mt-2">{value}</div>
        </div>
        <div className={`size-9 rounded-xl grid place-items-center ${colorMap[accent]}`}>
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

function FlowRow({ icon: Icon, label, value, color }: { icon: typeof ArrowUpRight; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={`size-4 ${color}`} />
        {label}
      </div>
      <div className={`font-medium ${color}`}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="surface-card p-12 text-center">
      <Wallet className="size-12 mx-auto text-primary mb-4" />
      <h3 className="text-lg font-medium">Nenhuma transação ainda</h3>
      <p className="text-sm text-muted-foreground mt-1">Importe um arquivo OFX, CSV, XLSX, PDF ou imagem para começar.</p>
      <a href="/import" className="mt-6 inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
        Ir para Importar
      </a>
    </div>
  );
}

// Required to avoid unused-import warning for useSuspenseQuery if eslint complains
void useSuspenseQuery;
