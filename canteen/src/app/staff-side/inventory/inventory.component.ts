import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  InventoryLog,
  MenuService,
  Product,
} from '../../services/menu.service';
import { TopnavStaffComponent } from '../../components/topnav-staff/topnav-staff.component';
import { SidenavComponent } from '../../components/sidenav/sidenav.component';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, TopnavStaffComponent, SidenavComponent],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.css',
})
export class InventoryComponent implements OnInit, OnDestroy {
  products: Product[] = [];
  filteredProducts: Product[] = [];
  inventoryLogs: InventoryLog[] = [];
  loadingProducts = false;
  loadingLogs = false;
  error = '';
  logError = '';
  
  // Filter properties
  searchQuery = '';
  categoryFilter = '';
  stockFilter = '';
  categories: string[] = [];

  private destroy$ = new Subject<void>();

  constructor(private menuService: MenuService, private router: Router) {}

  ngOnInit(): void {
    this.menuService.products$
      .pipe(takeUntil(this.destroy$))
      .subscribe((products) => {
        this.products = products;
        this.extractCategories();
        this.applyFilters();
      });

    this.menuService.inventoryLogs$
      .pipe(takeUntil(this.destroy$))
      .subscribe((logs) => {
        this.inventoryLogs = logs;
      });

    this.refreshProducts();
    this.refreshInventoryLogs();
  }

  extractCategories(): void {
    const uniqueCategories = new Set(
      this.products.map((p) => p.category).filter((c) => c)
    );
    this.categories = Array.from(uniqueCategories).sort();
  }

  applyFilters(): void {
    let filtered = [...this.products];

    // Apply search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (this.categoryFilter) {
      filtered = filtered.filter(
        (product) => product.category === this.categoryFilter
      );
    }

    // Apply stock filter
    if (this.stockFilter) {
      switch (this.stockFilter) {
        case 'low':
          filtered = filtered.filter(
            (product) => (product.stock ?? 0) > 0 && (product.stock ?? 0) <= 10
          );
          break;
        case 'normal':
          filtered = filtered.filter((product) => (product.stock ?? 0) > 10);
          break;
        case 'out':
          filtered = filtered.filter((product) => (product.stock ?? 0) === 0);
          break;
      }
    }

    this.filteredProducts = filtered;
  }

  refreshProducts(): void {
    this.loadingProducts = true;
    this.error = '';
    this.menuService.getProducts().subscribe({
      next: () => (this.loadingProducts = false),
      error: (error) => {
        console.error('Error loading products for inventory view:', error);
        this.loadingProducts = false;
        this.error = 'Failed to load products. Please try again later.';
      },
    });
  }

  refreshInventoryLogs(): void {
    this.loadingLogs = true;
    this.logError = '';
    this.menuService.getInventoryLogs().subscribe({
      next: () => (this.loadingLogs = false),
      error: (error) => {
        console.error('Error loading inventory logs:', error);
        this.loadingLogs = false;
        this.logError = 'Failed to load inventory logs. Please try again later.';
      },
    });
  }

  toggleView(): void {
    this.router.navigate(['/staff/menu']);
  }

  trackByProductId(_index: number, product: Product): number {
    return product.id;
  }

  trackByLogId(_index: number, log: InventoryLog): number {
    return log.log_id;
  }

  formatQuantity(change: number): string {
    if (change > 0) {
      return `+${change}`;
    }
    return `${change}`;
  }

  isLowStock(stock: number | null | undefined): boolean {
    return (stock ?? 0) <= 10;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
