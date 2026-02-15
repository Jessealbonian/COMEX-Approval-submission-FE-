import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { TopnavStaffComponent } from '../../components/topnav-staff/topnav-staff.component';
import { SidenavComponent } from '../../components/sidenav/sidenav.component';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { forkJoin, of } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';

interface DashboardStats {
  pendingOrders: number;
  readyOrders: number;
  activeItems: number;
  lowStockItems: number;
  activeVolunteers: number;
  todayDeliveries: number;
  todayRevenue: number;
  todayOrders: number;
  topSellingCategory: string;
  topSellingItem: string;
}

interface AnalyticsData {
  period: string;
  revenue: Array<{
    period: string;
    revenue: number;
    orders: number;
  }>;
  categories: Array<{
    name: string;
    count: number;
    revenue: number;
  }>;
  items: Array<{
    name: string;
    count: number;
    revenue: number;
  }>;
}

interface ReportOrderDetail {
  productName: string;
  quantity: number;
  price: number;
  category?: string;
  categoryId?: number;
  categoryName?: string;
  total?: number;
  orderDate?: string;
  orderId?: number;
}

interface ReportData {
  period: string;
  dateRange: string;
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  averageDailySales: number;
  topCategory: {
    name: string;
    quantity: number;
    revenue: number;
  };
  topItem: {
    name: string;
    quantity: number;
    revenue: number;
  };
  volunteerStats: {
    totalDeliveries: number;
    activeVolunteers: number;
    averageDeliveryTime: string;
  };
  orders?: ReportOrderDetail[];
}

interface DateRange {
  start: Date;
  end: Date;
}

@Component({
  selector: 'app-staff-dashboard',
  standalone: true,
  imports: [
    TopnavStaffComponent,
    SidenavComponent,
    CommonModule,
    RouterModule,
    FormsModule,
  ],
  templateUrl: './staff-dashboard.component.html',
  styleUrl: './staff-dashboard.component.css',
})
export class StaffDashboardComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  @ViewChild('revenueChart', { static: false })
  revenueChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryChart', { static: false })
  categoryChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('itemChart', { static: false })
  itemChartRef?: ElementRef<HTMLCanvasElement>;

  dashboardStats: DashboardStats = {
    pendingOrders: 0,
    readyOrders: 0,
    activeItems: 0,
    lowStockItems: 0,
    activeVolunteers: 0,
    todayDeliveries: 0,
    todayRevenue: 0,
    todayOrders: 0,
    topSellingCategory: '',
    topSellingItem: '',
  };

  analyticsData: AnalyticsData | null = null;
  canteenStatus: boolean = true;
  isLoading: boolean = true;
  isAnalyticsLoading: boolean = false;
  selectedPeriod: string = 'daily';

  // Report generator properties
  showReportModal: boolean = false;
  showReportView: boolean = false;
  isGeneratingReport: boolean = false;
  reportData: ReportData | null = null;
  reportPeriod: string = 'daily';
  reportType: string = 'current'; // 'current' or 'specific'
  currentStep: number = 1; // Step-by-step navigation
  // Specific period selectors
  specificDailyDate: string = '';
  specificWeekly: string = '';
  specificMonthly: string = '';
  specificYear: string = '';

  private refreshInterval: any;
  private resizeListener: any;
  private revenueChart: Chart | null = null;
  private categoryChart: Chart | null = null;
  private itemChart: Chart | null = null;
  private isViewInitialized = false;
  private readonly CATEGORY_ID_TO_NAME: Record<number, string> = {
    1: 'Rice Meals',
    2: 'Drinks',
    3: 'Sandwiches',
    4: 'Snacks',
  };
  private readonly CATEGORY_NORMALIZED: Record<string, string> = {
    'rice meals': 'Rice Meals',
    ricemeals: 'Rice Meals',
    'rice meal': 'Rice Meals',
    drinks: 'Drinks',
    drink: 'Drinks',
    beverages: 'Drinks',
    beverage: 'Drinks',
    sandwiches: 'Sandwiches',
    sandwich: 'Sandwiches',
    snacks: 'Snacks',
    snack: 'Snacks',
  };

  constructor(private http: HttpClient) {
    // Register Chart.js components safely
    if (typeof window !== 'undefined') {
      try {
        Chart.register(...registerables);
      } catch (error) {
        console.error('Error registering Chart.js:', error);
      }
    }
  }

  ngOnInit() {
    // Only initialize in browser environment
    if (typeof window !== 'undefined') {
      this.loadDashboardData();
      this.loadCanteenStatus();
      this.loadAnalyticsData();

      // Refresh dashboard data and canteen status every 30 seconds (but not analytics)
      this.refreshInterval = setInterval(() => {
        this.loadDashboardData();
        this.loadCanteenStatus();
        // Analytics data will only refresh when user navigates to this page or changes filters
      }, 30000);

      // Add window resize listener for chart responsiveness
      this.resizeListener = () => {
        this.handleWindowResize();
      };
      window.addEventListener('resize', this.resizeListener);
    }
  }

  ngAfterViewInit() {
    this.isViewInitialized = true;

    if (this.analyticsData && typeof window !== 'undefined') {
      setTimeout(() => {
        try {
          this.createCharts();
        } catch (error) {
          console.error('Error creating charts after view init:', error);
        }
      }, 0);
    }
  }

  ngOnDestroy() {
    // Clear interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Remove resize listener
    if (this.resizeListener && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }

    // Destroy all charts safely
    try {
      if (this.revenueChart) {
        this.revenueChart.destroy();
        this.revenueChart = null;
      }
    } catch (error) {
      console.error('Error destroying revenue chart:', error);
    }

    try {
      if (this.categoryChart) {
        this.categoryChart.destroy();
        this.categoryChart = null;
      }
    } catch (error) {
      console.error('Error destroying category chart:', error);
    }

    try {
      if (this.itemChart) {
        this.itemChart.destroy();
        this.itemChart = null;
      }
    } catch (error) {
      console.error('Error destroying item chart:', error);
    }
  }

  loadDashboardData() {
    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    if (!token) {
      console.error('No authentication token found');
      this.isLoading = false;
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    this.http
      .get<DashboardStats>(`${environment.apiUrl}/api/dashboard/stats`, {
        headers,
      })
      .subscribe({
        next: (data) => {
          this.dashboardStats = data;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading dashboard data:', error);
          this.isLoading = false;
        },
      });
  }

  loadCanteenStatus() {
    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    if (!token) {
      console.error('No authentication token found');
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    this.http
      .get<{ isActive: boolean }>(`${environment.apiUrl}/api/canteen/status`, {
        headers,
      })
      .subscribe({
        next: (data) => {
          this.canteenStatus = data.isActive;
        },
        error: (error) => {
          console.error('Error loading canteen status:', error);
        },
      });
  }

  async toggleCanteenStatus() {
    const newStatus = !this.canteenStatus;

    if (!newStatus) {
      // Setting to inactive - show warning about pending orders
      const result = await Swal.fire({
        title: 'Set Canteen to Inactive?',
        text: 'This will cancel all pending orders and prevent new orders from being placed. Are you sure?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, set to inactive',
        cancelButtonText: 'Cancel',
      });

      if (!result.isConfirmed) {
        return;
      }
    } else {
      // Setting to active - show confirmation
      const result = await Swal.fire({
        title: 'Set Canteen to Active?',
        text: 'The canteen will now accept new orders from students.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, set to active',
        cancelButtonText: 'Cancel',
      });

      if (!result.isConfirmed) {
        return;
      }
    }

    // Update canteen status
    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    if (!token) {
      console.error('No authentication token found');
      Swal.fire({
        title: 'Error!',
        text: 'Authentication required. Please log in again.',
        icon: 'error',
      });
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    this.http
      .put(
        `${environment.apiUrl}/api/canteen/status`,
        { isActive: newStatus },
        { headers }
      )
      .subscribe({
        next: (response: any) => {
          this.canteenStatus = newStatus;
          Swal.fire({
            title: 'Success!',
            text: response.message,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false,
          });
        },
        error: (error) => {
          console.error('Error updating canteen status:', error);
          Swal.fire({
            title: 'Error!',
            text: 'Failed to update canteen status. Please try again.',
            icon: 'error',
          });
        },
      });
  }

  formatCurrency(amount: number | null | undefined): string {
    const numericAmount =
      typeof amount === 'number' && isFinite(amount) ? amount : 0;
    return `₱${numericAmount.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  formatPercentage(percentage: number): string {
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage}%`;
  }

  loadAnalyticsData() {
    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    if (!token) {
      console.error('No authentication token found');
      return;
    }

    this.isAnalyticsLoading = true;
    const headers = { Authorization: `Bearer ${token}` };
    const params = {
      period: this.selectedPeriod,
    };

    this.http
      .get<AnalyticsData>(`${environment.apiUrl}/api/dashboard/analytics`, {
        headers,
        params,
      })
      .subscribe({
        next: (data) => {
          this.analyticsData = data;
          this.isAnalyticsLoading = false;
          // Use setTimeout to ensure DOM is ready
          if (typeof window !== 'undefined' && this.isViewInitialized) {
            setTimeout(() => {
              try {
                this.createCharts();
              } catch (error) {
                console.error('Error creating charts:', error);
              }
            }, 100);
          }
        },
        error: (error) => {
          console.error('Error loading analytics data:', error);
          this.isAnalyticsLoading = false;
        },
      });
  }

  onPeriodChange() {
    this.loadAnalyticsData();
  }

  createCharts() {
    if (!this.analyticsData || !this.isViewInitialized) return;

    this.createRevenueChart();
    this.createCategoryChart();
    this.createItemChart();
  }

  handleWindowResize() {
    // Debounce resize events to avoid excessive chart updates
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = setTimeout(() => {
      this.resizeCharts();
    }, 250);
  }

  private resizeTimeout: any;

  resizeCharts() {
    try {
      if (this.revenueChart) {
        this.revenueChart.resize();
      }
      if (this.categoryChart) {
        this.categoryChart.resize();
      }
      if (this.itemChart) {
        this.itemChart.resize();
      }
    } catch (error) {
      console.error('Error resizing charts:', error);
    }
  }

  createRevenueChart() {
    if (!this.analyticsData) return;
    if (!this.revenueChartRef || !this.revenueChartRef.nativeElement) return;

    if (this.revenueChart) {
      this.revenueChart.destroy();
      this.revenueChart = null;
    }

    try {
      const ctx = this.revenueChartRef.nativeElement.getContext('2d');
      if (!ctx) return;

      const config: ChartConfiguration = {
        type: 'line',
        data: {
          labels: this.analyticsData.revenue.map((item) => item.period),
          datasets: [
            {
              label: 'Revenue (₱)',
              data: this.analyticsData.revenue.map((item) => item.revenue),
              borderColor: '#27ae60',
              backgroundColor: 'rgba(39, 174, 96, 0.1)',
              borderWidth: 3,
              fill: true,
              tension: 0.4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          resizeDelay: 0,
          plugins: {
            title: {
              display: true,
              text: `Revenue Trends (${this.selectedPeriod})`,
              font: {
                size: window.innerWidth < 768 ? 14 : 16,
              },
            },
            legend: {
              display: false,
            },
          },
          scales: {
            x: {
              ticks: {
                font: {
                  size: window.innerWidth < 768 ? 10 : 12,
                },
                maxRotation: window.innerWidth < 768 ? 45 : 0,
              },
            },
            y: {
              beginAtZero: true,
              ticks: {
                font: {
                  size: window.innerWidth < 768 ? 10 : 12,
                },
                callback: function (value) {
                  return '₱' + value.toLocaleString();
                },
              },
            },
          },
        },
      };

      this.revenueChart = new Chart(ctx, config);
    } catch (error) {
      console.error('Error creating revenue chart:', error);
    }
  }

  createCategoryChart() {
    if (!this.analyticsData) return;
    if (!this.categoryChartRef || !this.categoryChartRef.nativeElement) return;

    if (this.categoryChart) {
      this.categoryChart.destroy();
      this.categoryChart = null;
    }

    try {
      const ctx = this.categoryChartRef.nativeElement.getContext('2d');
      if (!ctx) return;

      const config: ChartConfiguration = {
        type: 'doughnut',
        data: {
          labels: this.analyticsData.categories.map((item) => item.name),
          datasets: [
            {
              data: this.analyticsData.categories.map((item) => item.count),
              backgroundColor: [
                '#3498db',
                '#e74c3c',
                '#f39c12',
                '#2ecc71',
                '#9b59b6',
                '#1abc9c',
                '#34495e',
                '#e67e22',
                '#95a5a6',
                '#f1c40f',
              ],
              borderWidth: 2,
              borderColor: '#fff',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          resizeDelay: 0,
          plugins: {
            title: {
              display: true,
              text: `Top Categories (${this.selectedPeriod})`,
              font: {
                size: window.innerWidth < 768 ? 14 : 16,
              },
            },
            legend: {
              position: 'bottom',
              labels: {
                padding: window.innerWidth < 768 ? 10 : 20,
                usePointStyle: true,
                font: {
                  size: window.innerWidth < 768 ? 10 : 12,
                },
              },
            },
          },
        },
      };

      this.categoryChart = new Chart(ctx, config);
    } catch (error) {
      console.error('Error creating category chart:', error);
    }
  }

  createItemChart() {
    if (!this.analyticsData) return;
    if (!this.itemChartRef || !this.itemChartRef.nativeElement) return;

    if (this.itemChart) {
      this.itemChart.destroy();
      this.itemChart = null;
    }

    try {
      const ctx = this.itemChartRef.nativeElement.getContext('2d');
      if (!ctx) return;

      const config: ChartConfiguration = {
        type: 'bar',
        data: {
          labels: this.analyticsData.items.slice(0, 5).map((item) => item.name),
          datasets: [
            {
              label: 'Orders',
              data: this.analyticsData.items
                .slice(0, 5)
                .map((item) => item.count),
              backgroundColor: '#3498db',
              borderColor: '#2980b9',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          resizeDelay: 0,
          plugins: {
            title: {
              display: true,
              text: `Top Items (${this.selectedPeriod})`,
              font: {
                size: window.innerWidth < 768 ? 14 : 16,
              },
            },
            legend: {
              display: false,
            },
          },
          scales: {
            x: {
              ticks: {
                font: {
                  size: window.innerWidth < 768 ? 10 : 12,
                },
                maxRotation: window.innerWidth < 768 ? 45 : 0,
              },
            },
            y: {
              beginAtZero: true,
              ticks: {
                font: {
                  size: window.innerWidth < 768 ? 10 : 12,
                },
                stepSize: 1,
              },
            },
          },
        },
      };

      this.itemChart = new Chart(ctx, config);
    } catch (error) {
      console.error('Error creating item chart:', error);
    }
  }

  // Open report configuration modal
  openReportModal() {
    this.showReportModal = true;
    this.currentStep = 1;
    this.reportPeriod = 'daily';
    this.reportType = 'current';
    this.specificDailyDate = '';
    this.specificWeekly = '';
    this.specificMonthly = '';
    this.specificYear = '';
  }

  // Close report configuration modal
  closeReportModal() {
    this.showReportModal = false;
  }

  // Handle report type change
  onReportTypeChange() {
    // Clear all form data when switching types
    this.specificDailyDate = '';
    this.specificWeekly = '';
    this.specificMonthly = '';
    this.specificYear = '';
  }

  // Select report type (for clickable cards)
  selectReportType(type: string) {
    this.reportType = type;
    this.onReportTypeChange();
  }

  // Step navigation methods
  nextStep() {
    if (this.currentStep < 3) {
      this.currentStep++;
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  // Validate date selection
  isDateSelectionValid(): boolean {
    if (this.reportType === 'current') {
      return true;
    }

    if (this.reportType === 'specific') {
      switch (this.reportPeriod) {
        case 'daily':
          return !!this.specificDailyDate;
        case 'weekly':
          return !!this.specificWeekly;
        case 'monthly':
          return !!this.specificMonthly;
        case 'yearly':
          return !!this.specificYear;
        default:
          return false;
      }
    }

    return false;
  }

  // Get display name for report type
  getReportTypeDisplayName(): string {
    switch (this.reportType) {
      case 'current':
        return 'Current Period';
      case 'specific':
        return 'Specific Period';
      default:
        return 'Unknown';
    }
  }

  // Get display value for specific period
  getSpecificPeriodDisplay(): string {
    switch (this.reportPeriod) {
      case 'daily':
        return this.specificDailyDate || 'Not selected';
      case 'weekly':
        return this.specificWeekly || 'Not selected';
      case 'monthly':
        return this.specificMonthly || 'Not selected';
      case 'yearly':
        return this.specificYear || 'Not selected';
      default:
        return 'Not selected';
    }
  }

  // Generate report
  async generateReport() {
    // Validate specific period inputs
    if (this.reportType === 'specific') {
      if (this.reportPeriod === 'daily' && !this.specificDailyDate) {
        Swal.fire({
          title: 'Validation Error',
          text: 'Please select the specific day.',
          icon: 'warning',
          confirmButtonColor: '#52796f',
        });
        return;
      }
      if (this.reportPeriod === 'weekly' && !this.specificWeekly) {
        Swal.fire({
          title: 'Validation Error',
          text: 'Please select the specific week.',
          icon: 'warning',
          confirmButtonColor: '#52796f',
        });
        return;
      }
      if (this.reportPeriod === 'monthly' && !this.specificMonthly) {
        Swal.fire({
          title: 'Validation Error',
          text: 'Please select the specific month.',
          icon: 'warning',
          confirmButtonColor: '#52796f',
        });
        return;
      }
      if (this.reportPeriod === 'yearly' && !this.specificYear) {
        Swal.fire({
          title: 'Validation Error',
          text: 'Please enter the specific year.',
          icon: 'warning',
          confirmButtonColor: '#52796f',
        });
        return;
      }
    }

    this.isGeneratingReport = true;

    const dateRange = this.resolveReportDateRange();
    if (!dateRange) {
      this.isGeneratingReport = false;
      Swal.fire({
        title: 'Validation Error',
        text: 'Unable to determine the selected period. Please try again.',
        icon: 'warning',
        confirmButtonColor: '#52796f',
      });
      return;
    }

    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    if (!token) {
      console.error('No authentication token found');
      this.isGeneratingReport = false;
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    let params = new HttpParams().set('period', this.reportPeriod);

    if (this.reportType === 'specific') {
      switch (this.reportPeriod) {
        case 'daily':
          params = params.set('targetDate', this.specificDailyDate);
          break;
        case 'weekly':
          params = params.set('targetWeek', this.specificWeekly);
          break;
        case 'monthly':
          params = params.set('targetMonth', this.specificMonthly);
          break;
        case 'yearly':
          params = params.set('targetYear', this.specificYear);
          break;
      }
    }

    params = params.set('scope', this.reportType);

    const reportSummary$ = this.http.get<ReportData>(
      `${environment.apiUrl}/api/dashboard/report`,
      {
        headers,
        params,
      }
    );

    reportSummary$
      .pipe(
        switchMap((summary) => {
          const hasOrdersProp =
            summary && Object.prototype.hasOwnProperty.call(summary, 'orders');
          const normalizedOrders = this.normalizeReportOrders(
            (summary as any).orders
          );

          if (hasOrdersProp) {
            return of({ summary, orders: normalizedOrders });
          }

          return this.fetchReportOrders(dateRange, headers).pipe(
            map((orders) => ({ summary, orders }))
          );
        })
      )
      .subscribe({
        next: ({ summary, orders }) => {
          const { orders: _ignored, ...baseSummary } = summary as ReportData & {
            orders?: any;
          };

          this.reportData = {
            ...baseSummary,
            orders,
          };
          this.logCategoryAggregation(this.buildCategoryGroups(orders));
          this.isGeneratingReport = false;
          this.showReportModal = false;
          this.showReportView = true;
        },
        error: (error) => {
          console.error('Error generating report:', error);
          this.isGeneratingReport = false;
          Swal.fire({
            title: 'Error!',
            text: 'Failed to generate report. Please try again.',
            icon: 'error',
            confirmButtonColor: '#52796f',
          });
        },
      });
  }

  // Close report view
  closeReportView() {
    this.showReportView = false;
    this.reportData = null;
  }

  // Print report
  printReport() {
    // Get the report container element
    const reportContainer = document.querySelector('.report-container');
    if (!reportContainer) {
      console.error('Report container not found');
      return;
    }

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      console.error('Could not open print window');
      return;
    }

    // Get the current page's styles
    const styles = Array.from(document.styleSheets)
      .map((styleSheet) => {
        try {
          return Array.from(styleSheet.cssRules)
            .map((rule) => rule.cssText)
            .join('\n');
        } catch (e) {
          // Handle cross-origin stylesheets
          return '';
        }
      })
      .join('\n');

    // Create the print document
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Canteen Sales Report</title>
          <meta charset="utf-8">
          <style>
            ${styles}
            
            /* Print-specific overrides for A4 optimization */
            @page {
              size: A4 portrait;
              margin: 0.75in 0.5in;
            }
            
            body {
              margin: 0;
              padding: 0;
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              font-size: 12pt;
              line-height: 1.4;
              color: #2c3e50;
            }
            
            .report-container {
              max-width: 100% !important;
              padding: 0 !important;
              box-shadow: none !important;
              border-radius: 0 !important;
              margin: 0 !important;
              background: white !important;
            }
            
            /* Compact header for print */
            .report-header {
              text-align: center;
              border-bottom: 2px solid #52796f;
              padding-bottom: 0.75rem;
              margin-bottom: 1rem;
            }
            
            .report-logo {
              width: 50px !important;
              height: 50px !important;
              margin-bottom: 0.5rem;
            }
            
            .report-header h1 {
              font-size: 1.5rem !important;
              margin: 0 0 0.5rem 0;
              color: #2c3e50;
            }
            
            .report-meta {
              font-size: 0.8rem !important;
              gap: 1rem !important;
            }
            
            /* Compact sections */
            .report-section {
              margin-bottom: 1rem !important;
              page-break-inside: avoid;
            }
            
            .report-section h2 {
              font-size: 1.1rem !important;
              margin: 0 0 0.75rem 0;
              border-bottom: 1px solid #e9ecef;
              padding-bottom: 0.25rem;
            }
            
            /* Optimized grids for A4 */
            .summary-grid {
              grid-template-columns: repeat(3, 1fr) !important;
              gap: 0.5rem !important;
              margin-bottom: 0.75rem !important;
            }
            
            .summary-card {
              padding: 0.75rem !important;
              gap: 0.5rem !important;
            }
            
            .summary-card .material-icons {
              font-size: 1.5rem !important;
            }
            
            .summary-label {
              font-size: 0.7rem !important;
            }
            
            .summary-value {
              font-size: 1rem !important;
            }
            
            .performers-grid {
              grid-template-columns: 1fr 1fr !important;
              gap: 0.75rem !important;
            }
            
            .performer-card {
              padding: 0.75rem !important;
            }
            
            .performer-card h3 {
              font-size: 0.9rem !important;
              margin: 0 0 0.5rem 0;
            }
            
            .performer-name {
              font-size: 0.9rem !important;
              margin: 0 0 0.5rem 0;
            }
            
            .stat {
              padding: 0.25rem !important;
              font-size: 0.8rem !important;
            }
            
            .volunteer-stats-grid {
              grid-template-columns: repeat(3, 1fr) !important;
              gap: 0.5rem !important;
            }
            
            .volunteer-stat {
              padding: 0.75rem !important;
              gap: 0.5rem !important;
            }
            
            .volunteer-stat .material-icons {
              font-size: 1.5rem !important;
            }
            
            .volunteer-stat-label {
              font-size: 0.7rem !important;
            }
            
            .volunteer-stat-value {
              font-size: 1rem !important;
            }
            
            .report-footer {
              font-size: 0.7rem !important;
              padding-top: 0.75rem !important;
              margin-top: 0.75rem !important;
            }
            
            @media print {
              .no-print {
                display: none !important;
              }
              
              * {
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
            }
          </style>
        </head>
        <body>
          ${reportContainer.outerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for the content to load, then print
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  }

  // Get current date and time for report
  getCurrentDateTime(): string {
    return new Date().toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
  }

  getReportSummaryPeriod(): string {
    if (this.reportType === 'current') {
      return this.getCurrentPeriodLabel();
    }

    return this.getSpecificPeriodDisplay();
  }

  getCurrentPeriodLabel(): string {
    const labels: Record<string, string> = {
      daily: 'Day',
      weekly: 'Week',
      monthly: 'Month',
      yearly: 'Year',
    };

    const periodLabel = labels[this.reportPeriod] || this.reportPeriod;
    return `Current ${periodLabel}`;
  }

  getPeriodTypeLabel(): string {
    const labels: Record<string, string> = {
      daily: 'Day',
      weekly: 'Week',
      monthly: 'Month',
      yearly: 'Year',
    };

    return labels[this.reportPeriod] || this.reportPeriod;
  }

  getCurrentPeriodHelpText(): string {
    const descriptions: Record<string, string> = {
      daily: 'current day',
      weekly: 'current week',
      monthly: 'current month',
      yearly: 'current year',
    };

    const description =
      descriptions[this.reportPeriod] || `current ${this.reportPeriod}`;
    return `The report will include every order placed during the ${description}.`;
  }

  getOrderLineTotal(order: ReportOrderDetail): number {
    const quantity = Number(order.quantity ?? 0);
    const price = Number(order.price ?? 0);
    const parsedTotal = Number(order.total);
    const explicitTotal =
      typeof order.total === 'number' && isFinite(order.total)
        ? order.total
        : Number.isFinite(parsedTotal)
        ? parsedTotal
        : NaN;
    const fallbackTotal = quantity * price;
    const baseTotal = Number.isFinite(explicitTotal)
      ? explicitTotal
      : fallbackTotal;
    return Number.isFinite(baseTotal) ? baseTotal : 0;
  }

  getOrdersGrandTotal(): number {
    if (
      !this.reportData ||
      !this.reportData.orders ||
      !this.reportData.orders.length
    ) {
      return 0;
    }

    return this.reportData.orders.reduce(
      (sum, order) => sum + this.getOrderLineTotal(order),
      0
    );
  }

  getOrdersByCategory() {
    return this.buildCategoryGroups(this.reportData?.orders || []);
  }

  trackCategoryGroup(_index: number, group: { category: string }) {
    return group.category;
  }

  trackReportOrder(_index: number, order: ReportOrderDetail): string {
    const identifier = order.orderId
      ? order.orderId.toString()
      : order.productName;
    return order.orderDate ? `${identifier}-${order.orderDate}` : identifier;
  }

  private normalizeReportOrders(rawOrders: any): ReportOrderDetail[] {
    if (!Array.isArray(rawOrders)) {
      return [];
    }

    return rawOrders.map((item: any) => {
      const quantity = Number(item?.quantity ?? 0);
      const price = Number(
        item?.price ?? item?.price_each ?? item?.unit_price ?? 0
      );
      const totals = [
        item?.total,
        item?.lineTotal,
        item?.line_total,
        item?.subtotal,
        item?.total_price,
        item?.amount,
      ].map((value) => Number(value));

      const explicitTotal = totals.find((value) => Number.isFinite(value));
      const computedTotal = Number.isFinite(explicitTotal)
        ? explicitTotal!
        : quantity * price;

      return {
        productName:
          item?.productName ??
          item?.product_name ??
          item?.name ??
          (item?.product_id != null
            ? `Product ${item.product_id}`
            : 'Unnamed Product'),
        quantity,
        price,
        categoryId:
          typeof item?.categoryId === 'number'
            ? item.categoryId
            : typeof item?.category_id === 'number'
            ? item.category_id
            : undefined,
        categoryName: item?.categoryName ?? item?.category_name,
        category: this.resolveCategoryName(item),
        total: Number.isFinite(computedTotal)
          ? computedTotal
          : quantity * price,
        orderDate:
          item?.orderDate ?? item?.order_date ?? item?.created_at ?? undefined,
        orderId:
          typeof item?.orderId === 'number'
            ? item.orderId
            : typeof item?.order_id === 'number'
            ? item.order_id
            : undefined,
      };
    });
  }

  private fetchReportOrders(
    range: DateRange,
    headers: { [key: string]: string }
  ) {
    return this.http.get<any>(`${environment.apiUrl}/orders`, { headers }).pipe(
      map((response: any) => {
        if (Array.isArray(response)) {
          return response;
        }
        if (Array.isArray(response?.data)) {
          return response.data;
        }
        if (Array.isArray(response?.orders)) {
          return response.orders;
        }
        return [];
      }),
      map((orders: any[]) =>
        orders.filter(
          (order) =>
            typeof order?.order_id === 'number' &&
            this.isDateWithinRange(order?.created_at, range)
        )
      ),
      mergeMap((filteredOrders) => {
        if (!filteredOrders.length) {
          return of<ReportOrderDetail[]>([]);
        }

        const detailRequests = filteredOrders.map((order) =>
          this.http
            .get<any>(`${environment.apiUrl}/orders/${order.order_id}`, {
              headers,
            })
            .pipe(
              map((detail) => this.transformOrderDetail(detail)),
              catchError((error) => {
                console.error(
                  'Error fetching order detail for report:',
                  order?.order_id,
                  error
                );
                return of<ReportOrderDetail[]>([]);
              })
            )
        );

        return forkJoin(detailRequests).pipe(
          map((details) =>
            details
              .flat()
              .sort((a, b) => this.compareOrderDetailsByDateDesc(a, b))
          )
        );
      }),
      catchError((error) => {
        console.error('Error fetching orders for report:', error);
        return of<ReportOrderDetail[]>([]);
      })
    );
  }

  private compareOrderDetailsByDateDesc(
    a: ReportOrderDetail,
    b: ReportOrderDetail
  ): number {
    const aTime = a.orderDate ? new Date(a.orderDate).getTime() : 0;
    const bTime = b.orderDate ? new Date(b.orderDate).getTime() : 0;

    if (aTime === bTime) {
      const aId = typeof a.orderId === 'number' ? a.orderId : 0;
      const bId = typeof b.orderId === 'number' ? b.orderId : 0;
      return bId - aId;
    }

    return bTime - aTime;
  }

  private transformOrderDetail(detail: any): ReportOrderDetail[] {
    if (!detail) {
      return [];
    }

    const orderId = detail.order_id ?? detail.id ?? null;
    const orderDate =
      detail.created_at ?? detail.order_date ?? detail.date ?? null;
    const items = Array.isArray(detail.items)
      ? detail.items
      : Array.isArray(detail.order_items)
      ? detail.order_items
      : Array.isArray(detail.products)
      ? detail.products
      : [];

    return items.map((item: any) => {
      const quantity = Number(item?.quantity ?? item?.qty ?? item?.count ?? 0);
      const priceRaw =
        item?.price_each ?? item?.unit_price ?? item?.price ?? item?.cost ?? 0;
      const price = Number(priceRaw) || 0;
      const explicitTotal =
        item?.total ??
        item?.line_total ??
        item?.subtotal ??
        item?.total_price ??
        item?.amount ??
        undefined;
      const total =
        explicitTotal !== undefined && !isNaN(Number(explicitTotal))
          ? Number(explicitTotal)
          : quantity * price;

      return {
        productName: item?.product_name ?? item?.name ?? 'Unnamed Product',
        quantity,
        price,
        category:
          this.resolveCategoryName(item) || this.resolveCategoryName(detail),
        categoryId:
          typeof item?.category_id === 'number'
            ? item.category_id
            : typeof detail?.category_id === 'number'
            ? detail.category_id
            : undefined,
        categoryName: item?.category_name ?? detail?.category_name,
        total,
        orderDate: orderDate ?? undefined,
        orderId: typeof orderId === 'number' ? orderId : undefined,
      };
    });
  }

  private getOrderCategory(order: ReportOrderDetail | any): string {
    return this.resolveCategoryName(order);
  }

  private resolveCategoryName(source: any): string {
    if (!source) {
      return 'Uncategorized';
    }

    const stringCandidates: Array<string | null | undefined> = [
      source?.categoryName,
      source?.category_name,
      source?.category,
      source?.productCategory,
      source?.product_category,
      source?.type,
      source?.group,
      source?.product?.category,
      source?.product?.category_name,
    ];

    const rawString = stringCandidates.find(
      (value) => typeof value === 'string' && value.trim().length
    );

    if (typeof rawString === 'string') {
      const normalized = this.normalizeCategoryString(rawString);
      if (normalized) {
        return normalized;
      }
      return rawString.trim();
    }

    const numericCandidates: Array<number | null | undefined> = [
      source?.category_id,
      source?.categoryId,
      source?.categoryID,
      source?.productCategoryId,
      source?.product_category_id,
      source?.product_categoryid,
      source?.product_categoryID,
      source?.category?.id,
      source?.product?.category_id,
      source?.product?.categoryId,
    ];

    const numeric = numericCandidates.find(
      (value) => typeof value === 'number' && Number.isFinite(value)
    );
    if (typeof numeric === 'number' && this.CATEGORY_ID_TO_NAME[numeric]) {
      return this.CATEGORY_ID_TO_NAME[numeric];
    } else if (typeof numeric === 'number') {
      return `Category ${numeric}`;
    }

    return 'Uncategorized';
  }

  private normalizeCategoryString(value: string): string | null {
    const key = value.toString().trim().toLowerCase().replace(/\s+/g, ' ');
    if (this.CATEGORY_NORMALIZED[key]) {
      return this.CATEGORY_NORMALIZED[key];
    }

    const compactKey = key.replace(/[^a-z0-9]/gi, '');
    if (this.CATEGORY_NORMALIZED[compactKey]) {
      return this.CATEGORY_NORMALIZED[compactKey];
    }

    return null;
  }

  private buildCategoryGroups(orders: ReportOrderDetail[]) {
    if (!orders || !orders.length) {
      return [];
    }

    const grouped = new Map<string, ReportOrderDetail[]>();

    orders.forEach((order) => {
      const category = this.getOrderCategory(order);
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(order);
    });

    return Array.from(grouped.entries())
      .map(([category, items]) => {
        const totalQuantity = items.reduce(
          (sum, item) => sum + (Number(item.quantity) || 0),
          0
        );
        const totalRevenue = items.reduce(
          (sum, item) => sum + this.getOrderLineTotal(item),
          0
        );

        return {
          category,
          items,
          totalQuantity,
          totalRevenue,
        };
      })
      .sort((a, b) => {
        if (b.totalRevenue !== a.totalRevenue) {
          return b.totalRevenue - a.totalRevenue;
        }
        return a.category.localeCompare(b.category);
      });
  }

  private logCategoryAggregation(
    groups: Array<{
      category: string;
      items: ReportOrderDetail[];
      totalQuantity: number;
      totalRevenue: number;
    }>
  ) {
    if (!Array.isArray(groups) || !groups.length) {
      console.info('[Report] No orders to summarize by category.');
      return;
    }

    const summary = groups.map((g) => ({
      category: g.category,
      lines: g.items.length,
      units: g.totalQuantity,
      revenue: this.formatCurrency(g.totalRevenue),
    }));

    const uncategorized = groups.find((g) => g.category === 'Uncategorized');
    if (uncategorized) {
      console.warn(
        '[Report] Uncategorized items found in report breakdown:',
        summary
      );
    } else {
      console.info('[Report] Category breakdown:', summary);
    }
  }

  private resolveReportDateRange(): DateRange | null {
    if (this.reportType === 'current') {
      return this.getCurrentPeriodRange(this.reportPeriod);
    }

    if (this.reportType === 'specific') {
      return this.getSpecificPeriodRange();
    }

    return null;
  }

  private getCurrentPeriodRange(period: string): DateRange | null {
    const now = new Date();

    switch (period) {
      case 'daily': {
        const start = this.startOfDay(now);
        const end = this.endOfDay(now);
        return { start, end };
      }
      case 'weekly': {
        const start = this.startOfWeek(now);
        const end = this.endOfWeek(start);
        return { start, end };
      }
      case 'monthly': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { start: this.startOfDay(start), end: this.endOfDay(end) };
      }
      case 'yearly': {
        const start = new Date(now.getFullYear(), 0, 1);
        const end = new Date(now.getFullYear(), 11, 31);
        return { start: this.startOfDay(start), end: this.endOfDay(end) };
      }
      default:
        return null;
    }
  }

  private getSpecificPeriodRange(): DateRange | null {
    switch (this.reportPeriod) {
      case 'daily':
        if (!this.specificDailyDate) return null;
        return this.createRangeFromDateString(this.specificDailyDate);
      case 'weekly':
        if (!this.specificWeekly) return null;
        return this.parseIsoWeekInput(this.specificWeekly);
      case 'monthly':
        if (!this.specificMonthly) return null;
        return this.createRangeFromMonthInput(this.specificMonthly);
      case 'yearly':
        if (!this.specificYear) return null;
        return this.createRangeFromYearInput(this.specificYear);
      default:
        return null;
    }
  }

  private createRangeFromDateString(input: string): DateRange | null {
    const date = new Date(`${input}T00:00:00`);
    if (isNaN(date.getTime())) {
      return null;
    }
    return { start: this.startOfDay(date), end: this.endOfDay(date) };
  }

  private createRangeFromMonthInput(input: string): DateRange | null {
    const [yearStr, monthStr] = input.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return null;
    }

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { start: this.startOfDay(start), end: this.endOfDay(end) };
  }

  private createRangeFromYearInput(input: string): DateRange | null {
    const year = Number(input);
    if (!Number.isFinite(year)) {
      return null;
    }

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return { start: this.startOfDay(start), end: this.endOfDay(end) };
  }

  private parseIsoWeekInput(value: string): DateRange | null {
    const match = /^([0-9]{4})-W([0-9]{2})$/.exec(value);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const week = Number(match[2]);
    if (!Number.isFinite(year) || !Number.isFinite(week)) {
      return null;
    }

    const januaryFourth = new Date(year, 0, 4);
    const firstWeekStart = this.startOfWeek(januaryFourth);
    const start = new Date(firstWeekStart);
    start.setDate(firstWeekStart.getDate() + (week - 1) * 7);
    const end = this.endOfWeek(start);
    return { start, end };
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  private startOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = (day + 6) % 7; // Convert Sunday (0) to 6, Monday (1) to 0
    result.setDate(result.getDate() - diff);
    return this.startOfDay(result);
  }

  private endOfWeek(start: Date): Date {
    const result = new Date(start);
    result.setDate(result.getDate() + 6);
    return this.endOfDay(result);
  }

  private isDateWithinRange(value: any, range: DateRange): boolean {
    if (!value) {
      return false;
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return false;
    }

    return date >= range.start && date <= range.end;
  }
}
