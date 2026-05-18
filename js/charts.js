// Chart.js configuration for MarketSpace

let cashFlowChart = null;
let profitChart = null;

function getChartColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue('--primary').trim() || '#007AFF',
    primarySoft: style.getPropertyValue('--primary-soft').trim() || '#5AC8FA',
    success: style.getPropertyValue('--success').trim() || '#34C759',
    danger: style.getPropertyValue('--danger').trim() || '#FF3B30',
    warning: style.getPropertyValue('--warning').trim() || '#FF9500',
    purple: style.getPropertyValue('--purple').trim() || '#AF52DE',
    muted: style.getPropertyValue('--muted').trim() || '#8E8E93',
    border: style.getPropertyValue('--border').trim() || '#E5E5EA',
    card: style.getPropertyValue('--card').trim() || '#FFFFFF',
    bg: style.getPropertyValue('--bg').trim() || '#F2F2F7'
  };
}

function drawCashFlowChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const colors = getChartColors();
  const isDark = ctx.canvas.ownerDocument.defaultView.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // Prepare data
  const labels = data.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  });
  
  // Cumulative data
  let cumSales = 0, cumExpenses = 0, cumPurchases = 0;
  const salesData = [], expensesData = [], purchasesData = [], balanceData = [];
  
  for (const d of data) {
    cumSales += d.sales;
    cumExpenses += d.expenses;
    cumPurchases += d.purchases;
    salesData.push(cumSales);
    expensesData.push(cumExpenses + cumPurchases); // uscite totali = spese + acquisti
    purchasesData.push(cumPurchases);
    balanceData.push(cumSales - cumExpenses - cumPurchases);
  }
  
  // Destroy existing chart
  if (cashFlowChart) {
    cashFlowChart.destroy();
  }
  
  // Create chart
  cashFlowChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Entrate',
          data: salesData,
          borderColor: colors.success,
          backgroundColor: hexToRgba(colors.success, 0.1),
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2
        },
        {
          label: 'Uscite',
          data: expensesData,
          borderColor: colors.danger,
          backgroundColor: hexToRgba(colors.danger, 0.1),
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2
        },
        {
          label: 'Saldo',
          data: balanceData,
          borderColor: colors.primary,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 3,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
          titleColor: isDark ? '#FFFFFF' : '#000000',
          bodyColor: isDark ? '#8E8E93' : '#8E8E93',
          borderColor: colors.border,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          displayColors: true,
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': € ' + context.parsed.y.toFixed(2);
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: colors.muted,
            font: { size: 10 }
          }
        },
        y: {
          grid: {
            color: hexToRgba(colors.border, 0.5)
          },
          ticks: {
            color: colors.muted,
            font: { size: 10 },
            callback: function(value) {
              return '€' + value;
            }
          }
        }
      }
    }
  });
}

function drawProfitChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const colors = getChartColors();
  const isDark = ctx.canvas.ownerDocument.defaultView.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // Prepare data - cumulative profit over time
  let balance = 0;
  const profitData = [];
  // Per-period profit (for bars)
  const perPeriod = [];
  
  for (const d of data) {
    const periodProfit = (d.sales || 0) - (d.materialCost || 0);
    balance += periodProfit;
    profitData.push(balance);
    perPeriod.push(periodProfit);
  }
  
  // If no data, show single zero point
  if (profitData.length === 0) {
    profitData.push(0);
    perPeriod.push(0);
  }
  
  const labels = data.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  });
  if (labels.length === 0) labels.push('Oggi');
  
  // Adaptive coloring based on final profit
  const finalProfit = profitData[profitData.length - 1] || 0;
  const lineColor = finalProfit >= 0 ? colors.success : colors.danger;
  const fillColor = hexToRgba(lineColor, 0.12);
  const barPosColor = colors.success;
  const barNegColor = colors.danger;
  
  // Destroy existing chart
  if (profitChart) {
    profitChart.destroy();
  }
  
  // Build per-period bar colors
  const barColors = perPeriod.map(v => v >= 0 ? barPosColor : barNegColor);
  const barBorderColors = perPeriod.map(v => v >= 0 ? hexToRgba(barPosColor, 0.5) : hexToRgba(barNegColor, 0.5));
  
  // Create chart with mixed type
  profitChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Profitto periodo',
          data: perPeriod,
          backgroundColor: barColors,
          borderColor: barBorderColors,
          borderWidth: 1,
          borderRadius: 3,
          order: 2,
          yAxisID: 'y1'
        },
        {
          label: 'Profitto cumulativo',
          type: 'line',
          data: profitData,
          borderColor: lineColor,
          backgroundColor: fillColor,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 3,
          pointBackgroundColor: lineColor,
          pointBorderColor: isDark ? '#1C1C1E' : '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: (ctx) => {
            const i = ctx.dataIndex;
            if (i === profitData.length - 1) return 6;
            return 3;
          },
          order: 1,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
          titleColor: isDark ? '#FFFFFF' : '#000000',
          bodyColor: isDark ? '#8E8E93' : '#8E8E93',
          borderColor: colors.border,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: function(context) {
              if (context.dataset.label === 'Profitto cumulativo') {
                return 'Cumulativo: € ' + context.parsed.y.toFixed(2);
              }
              return 'Periodo: € ' + context.parsed.y.toFixed(2);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.muted, font: { size: 10 } }
        },
        y: {
          position: 'left',
          grid: { color: hexToRgba(colors.border, 0.5) },
          ticks: {
            color: colors.muted,
            font: { size: 10 },
            callback: function(v) { return '€' + v; }
          },
          title: {
            display: true,
            text: 'Cumulativo',
            color: colors.muted,
            font: { size: 9 }
          }
        },
        y1: {
          position: 'right',
          grid: { display: false },
          ticks: {
            color: colors.muted,
            font: { size: 10 },
            callback: function(v) { return '€' + v; }
          },
          title: {
            display: true,
            text: 'Periodo',
            color: colors.muted,
            font: { size: 9 }
          }
        }
      }
    }
  });
}

// Helper function
function hexToRgba(hex, alpha) {
  if (!hex) return 'rgba(0,0,0,0.1)';
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Handle chart resize
function initChartResize() {
  const resizeObserver = new ResizeObserver(entries => {
    if (cashFlowChart) cashFlowChart.resize();
    if (profitChart) profitChart.resize();
  });
  
  // Observe chart containers when they exist
  setTimeout(() => {
    const cashflowContainer = document.getElementById('chart-cashflow')?.parentElement;
    const profitContainer = document.getElementById('chart-profit')?.parentElement;
    
    if (cashflowContainer) resizeObserver.observe(cashflowContainer);
    if (profitContainer) resizeObserver.observe(profitContainer);
  }, 100);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initChartResize);
