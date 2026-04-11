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

function drawProfitChart(canvas, data, totalMaterialCost) {
  const ctx = canvas.getContext('2d');
  const colors = getChartColors();
  const isDark = ctx.canvas.ownerDocument.defaultView.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // Prepare data - profit over time
  let cumSales = 0, cumMaterial = 0;
  const profitData = [];
  
  for (const d of data) {
    cumSales += d.sales;
    cumMaterial += (d.materialCost || 0);
    profitData.push(cumSales - cumMaterial);
  }
  
  // If no data, show single point
  if (profitData.length === 0) {
    profitData.push(0);
  }
  
  const labels = data.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  });
  if (labels.length === 0) labels.push('Oggi');
  
  // Destroy existing chart
  if (profitChart) {
    profitChart.destroy();
  }
  
  // Create chart
  profitChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Profitto Lordo',
          data: profitData,
          borderColor: colors.purple,
          backgroundColor: hexToRgba(colors.purple, 0.2),
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 3,
          pointBackgroundColor: colors.purple,
          pointBorderColor: isDark ? '#1C1C1E' : '#FFFFFF',
          pointBorderWidth: 2
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
              return 'Profitto: € ' + context.parsed.y.toFixed(2);
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
