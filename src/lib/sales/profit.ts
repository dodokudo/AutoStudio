export function calculateGrossProfit(revenue: number, expenses: { amount: number; expenseType: string }[]) {
  const directCosts = expenses.reduce((sum, expense) => sum + (expense.expenseType === 'direct' ? expense.amount : 0), 0);
  const grossProfit = revenue - directCosts;
  return { directCosts, grossProfit, grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : null };
}
