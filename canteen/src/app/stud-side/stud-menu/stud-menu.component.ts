import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { TopnavComponent } from '../../components/topnav/topnav.component';
import { FooterComponent } from '../../components/footer/footer.component';
import { MenuService, Product } from '../../services/menu.service';
import { AuthService } from '../../auth.service';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-stud-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, TopnavComponent, FooterComponent],
  templateUrl: './stud-menu.component.html',
  styleUrl: './stud-menu.component.css',
})
export class StudMenuComponent implements OnInit, OnDestroy {
  categories: string[] = ['Rice Meals', 'Drinks', 'Sandwiches', 'Snacks'];
  currentCategory: string = 'Rice Meals';
  currentSubcategory: string | null = null;
  expandedCategory: string | null = null;
  subcategoriesMap: { [category: string]: string[] } = {};
  showModal: boolean = false;
  selectedProduct: any = null;
  quantity: number = 1;
  products: Product[] = [];
  filteredProducts: Product[] = [];
  isLoading: boolean = false;
  errorMessage: string | null = null;
  searchQuery: string = '';
  sortBy: string = 'date';
  apiUrl = environment.apiUrl;
  isVolunteer = false;
  isVolunteerAvailable = false;

  private volunteerAvailabilityListener = (event: Event) => {
    const detail = (event as CustomEvent<{ isAvailable?: boolean }>).detail;
    if (detail && typeof detail.isAvailable === 'boolean') {
      this.isVolunteerAvailable = detail.isAvailable;
    } else {
      this.refreshVolunteerAvailability();
    }
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private menuService: MenuService,
    private authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    // Scroll to top when component initializes
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Get category from query params and scroll to top on each category change
    this.route.queryParams.subscribe((params) => {
      if (params['category'] && this.categories.includes(params['category'])) {
        this.currentCategory = params['category'];
        // Scroll to top when category changes from dashboard
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    this.loadProducts();
    this.loadSubcategories();
    this.initializeVolunteerState();
    window.addEventListener(
      'volunteer-availability-updated',
      this.volunteerAvailabilityListener as EventListener
    );
  }

  ngOnDestroy(): void {
    window.removeEventListener(
      'volunteer-availability-updated',
      this.volunteerAvailabilityListener as EventListener
    );
  }

  private loadProducts(): void {
    this.isLoading = true;
    this.errorMessage = null;
    this.menuService.getProducts().subscribe({
      next: (products) => {
        // Filter out hidden products (only show visible products to students)
        this.products = products.filter(
          (product) => product.is_visible !== false
        );
        this.applyFiltersAndSort();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load products', err);
        this.errorMessage = 'Failed to load products. Please try again later.';
        this.isLoading = false;
      },
    });
  }

  getProductsByCategory(category: string): Product[] {
    const inCategory = this.filteredProducts.filter(
      (product) => product.category === category
    );
    if (category === this.currentCategory && this.currentSubcategory) {
      return inCategory.filter(
        (p) => (p.subcategory || null) === this.currentSubcategory
      );
    }
    return inCategory;
  }

  setCategory(category: string): void {
    this.currentCategory = category;
    this.currentSubcategory = null;
  }

  toggleCategoryDropdown(category: string): void {
    const hasSubs = (this.subcategoriesMap[category] || []).length > 0;

    if (!hasSubs) {
      // No subcategories, just set category and close dropdown
      this.setCategory(category);
      this.expandedCategory = null;
      return;
    }

    // Has subcategories
    if (this.expandedCategory === category) {
      // Already expanded, toggle it closed
      this.expandedCategory = null;
    } else {
      // Expand this category
      this.currentCategory = category;
      this.currentSubcategory = null;
      this.expandedCategory = category;
    }
  }

  setSubcategory(category: string, subcategory: string): void {
    this.currentCategory = category;
    this.currentSubcategory = subcategory;
    // Keep dropdown open when selecting subcategory
    this.expandedCategory = category;
  }

  clearSubcategoryFilter(): void {
    this.currentSubcategory = null;
  }

  // Apply filters and sorting
  applyFiltersAndSort(): void {
    let filtered = [...this.products];

    // Apply search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          product.category.toLowerCase().includes(query) ||
          product.price.toString().includes(query)
      );
    }

    // Apply sorting
    filtered = this.applySorting(filtered);

    // Update filtered products
    this.filteredProducts = filtered;
  }

  // Apply sorting logic
  private applySorting(products: Product[]): Product[] {
    const sorted = [...products];

    switch (this.sortBy) {
      case 'date':
        // Newest first (by ID)
        return sorted.sort((a, b) => b.id - a.id);

      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));

      case 'price-low-high':
        return sorted.sort((a, b) => a.price - b.price);

      case 'price-high-low':
        return sorted.sort((a, b) => b.price - a.price);

      case 'stock':
        // Highest stock first
        return sorted.sort((a, b) => b.stock - a.stock);

      case 'popular':
        // Sort by stock (items with lower stock are more popular as they're being bought more)
        // Combined with price (cheaper items tend to be more popular)
        return sorted.sort((a, b) => {
          const scoreA = 100 - a.stock + 100 / (a.price + 1);
          const scoreB = 100 - b.stock + 100 / (b.price + 1);
          return scoreB - scoreA;
        });

      default:
        return sorted;
    }
  }

  private loadSubcategories(): void {
    // Attempt to load subcategories for each known category
    this.categories.forEach((cat) => {
      this.menuService.getSubcategories(cat).subscribe({
        next: (subs) => {
          if (Array.isArray(subs) && subs.length > 0) {
            // Reverse the order for Drinks so Water comes first
            if (cat === 'Drinks') {
              this.subcategoriesMap[cat] = [...subs].reverse();
            } else {
              this.subcategoriesMap[cat] = subs;
            }
          }
        },
        error: () => {},
      });
    });
  }

  // Handle search input change
  onSearchChange(): void {
    this.applyFiltersAndSort();
  }

  // Clear search
  clearSearch(): void {
    this.searchQuery = '';
    this.applyFiltersAndSort();
  }

  // Handle sort change
  onSortChange(): void {
    this.applyFiltersAndSort();
  }

  goBack(): void {
    this.router.navigate(['/student/stud-dashboard']); // Navigate to home page
  }

  openModal(product: any) {
    if (product.stock !== undefined && product.stock <= 0) {
      return; // prevent opening modal for out of stock
    }
    this.selectedProduct = product;
    this.quantity = 1;
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.selectedProduct = null;
    this.quantity = 1;
  }

  increaseQuantity() {
    if (this.selectedProduct?.stock !== undefined) {
      if (this.quantity < this.selectedProduct.stock) {
        this.quantity++;
      }
      return;
    }
    this.quantity++;
  }

  decreaseQuantity() {
    if (this.quantity > 1) {
      this.quantity--;
    }
  }

  confirmOrder() {
    if (!this.selectedProduct) return;

    // Store product info before closing modal
    const productName = this.selectedProduct.name;
    const productQuantity = this.quantity;

    const item = {
      id: this.selectedProduct.id,
      name: this.selectedProduct.name,
      price: this.selectedProduct.price,
      category: this.selectedProduct.category,
      quantity: this.quantity,
    };

    const key = 'student_cart';
    const existing = sessionStorage.getItem(key);
    const cart: any[] = existing ? JSON.parse(existing) : [];
    const idx = cart.findIndex((i) => i.id === item.id);

    if (idx >= 0) {
      // respect stock
      const newQty = Math.min(
        (cart[idx].quantity || 0) + item.quantity,
        this.selectedProduct.stock ?? Infinity
      );
      cart[idx].quantity = newQty;
    } else {
      cart.push(item);
    }

    sessionStorage.setItem(key, JSON.stringify(cart));
    this.notifyCartUpdated();
    this.closeModal();

    // Show success confirmation
    Swal.fire({
      icon: 'success',
      title: 'Added to Cart!',
      text: `${productQuantity}x ${productName} has been added to your cart.`,
      confirmButtonText: 'Continue Shopping',
      confirmButtonColor: '#52796f',
      timer: 2000,
      timerProgressBar: true,
    });
  }

  private initializeVolunteerState(): void {
    const user = this.authService.getCurrentUser('student');
    this.isVolunteer = user?.role === 'volunteer';

    if (!this.isVolunteer) {
      this.isVolunteerAvailable = false;
      return;
    }

    this.refreshVolunteerAvailability();
  }

  private refreshVolunteerAvailability(): void {
    if (!this.isVolunteer) return;

    const token = this.authService.getToken('student');
    if (!token) {
      this.isVolunteerAvailable = false;
      return;
    }

    const headers = { Authorization: `Bearer ${token}` } as any;
    this.http.get(`${this.apiUrl}/volunteers/me`, { headers }).subscribe({
      next: (res: any) => {
        this.isVolunteerAvailable = !!res?.is_available;
      },
      error: () => {
        this.isVolunteerAvailable = false;
      },
    });
  }


  private notifyCartUpdated(): void {
    try {
      const raw = sessionStorage.getItem('student_cart');
      const cart = raw ? JSON.parse(raw) : [];
      const count = Array.isArray(cart)
        ? cart.reduce(
            (total: number, item: any) =>
              total + (Number(item?.quantity) || 0),
            0
          )
        : 0;

      window.dispatchEvent(
        new CustomEvent('student-cart-updated', {
          detail: { count },
        })
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent('student-cart-updated', {
          detail: { count: 0 },
        })
      );
    }
  }
}
