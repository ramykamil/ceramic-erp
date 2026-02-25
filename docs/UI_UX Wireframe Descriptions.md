'''markdown
# UI/UX Wireframe Descriptions

This document describes the design and workflow for the two most critical user interface screens identified in the project requirements.

---

### 1. The "Create Order" / POS Screen

**Objective:** To provide a fast, intuitive, and accurate interface for salespeople to create customer orders, with automatic pricing based on the powerful "Price Waterfall" logic.

**Layout:** A three-panel layout for maximum efficiency on a desktop screen.

| **Panel 1: Customer & Order Details (Left)** | **Panel 2: Product Entry (Center)** | **Panel 3: Order Summary (Right)** |
| :--- | :--- | :--- |
| Displays the context of the entire transaction. | The primary workspace for adding items. | Shows the real-time state of the cart and final totals. |

#### Panel 1: Customer & Order Details

*   **Customer Selection:** A prominent search box at the top allows the user to search for a customer by name, code, or phone number. Selecting a customer populates this panel.
*   **Customer Information Card:**
    *   **Customer Name:** (e.g., "Client-A Construction")
    *   **Customer Type:** (e.g., "WHOLESALE")
    *   **Assigned Price List:** (e.g., "Wholesale Price List")
    *   **Current Balance:** (e.g., "$5,430.00 Overdue") - *Displayed in red if overdue.*
*   **Order Details Section:**
    *   **Order #:** Automatically generated (e.g., "ORD-2025-01234")
    *   **Order Date:** Defaults to today, editable.
    *   **Salesperson:** Automatically assigned to the logged-in user.
    *   **Warehouse:** Dropdown to select the warehouse from which stock will be drawn.

#### Panel 2: Product Entry & Pricing

*   **Product Search Bar:** An intelligent search bar with autocomplete. Users can search by Product Code or Product Name.
*   **Search Results:** As the user types, a dropdown list appears showing matching products, including `ProductName`, `ProductCode`, and `QuantityAvailable` in the selected warehouse.
*   **Item Entry Form:** Once a product is selected, this form appears:
    *   **Quantity:** A numeric input field.
    *   **Unit:** A dropdown menu populated with the valid units for that product (e.g., `PCS`, `BOX`, `SQM`).
    *   **Unit Price:** This field is **read-only**. It is automatically populated by the system after executing the **Price Waterfall Logic**.
    *   **Price Source Indicator:** A small, non-editable label next to the price displays its origin (e.g., `CONTRACT`, `PRICELIST`, or `BASE`). This provides immediate clarity to the salesperson on why the customer is getting that specific price.
    *   **"Add to Order" Button:** Adds the item to the cart in the right-hand panel.

#### Panel 3: Order Summary & Actions

*   **Item List:** A scrollable list of all items added to the order. Each row displays:
    *   Product Name & Code
    *   Quantity & Unit
    *   Unit Price
    *   Line Total
    *   A "Remove" (trash icon) button.
*   **Totals Section:**
    *   **Subtotal:** Sum of all line totals.
    *   **Discount:** An editable field for order-level discounts (if permitted).
    *   **Tax (VAT):** Automatically calculated.
    *   **Grand Total:** The final amount due.
*   **Action Buttons:**
    *   `Save Draft`: Saves the order without confirming it or reserving stock.
    *   `Confirm Order`: Confirms the order, reserves the inventory, and moves it to the next stage (e.g., "Processing").
    *   `Create Invoice`: (Optional, may appear after confirmation) Generates a formal invoice for the order.

---

### 2. The "Customer Specific Prices" Tab

**Objective:** To provide a powerful and user-friendly interface for managing thousands of unique, negotiated prices for a single wholesale client, including bulk import and export functionality.

**Location:** This UI is a tab within the main Customer Profile page. The navigation would look like: `Customers > Client-A Construction > [Profile] [Orders] [Invoices] [Specific Prices]`.

#### UI Components

1.  **Header:** Displays the customer's name prominently: "Specific Prices for: Client-A Construction".

2.  **Action Bar:** A set of buttons located above the main table:
    *   `[+ Add New Price]`: A button to manually add a single product-price rule.
    *   `[↑ Import Prices]`: A button to initiate the bulk import workflow.
    *   `[↓ Export Prices]`: A button to download all current prices for this customer as a CSV.

3.  **Price List Table:** A filterable and sortable table displaying all specific prices for the selected customer.

| Product Code (sortable) | Product Name (sortable) | **Specific Price** (editable) | Base Price (read-only) | Effective From (editable) | Effective To (editable) | Actions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| TILE-X-001 | Royal White Ceramic | $10.50 | $15.00 | 2025-01-01 | (none) | `[Save]` `[Delete]` |
| SINK-B-002 | Modern Basin | $120.00 | $150.00 | 2025-01-01 | 2025-12-31 | `[Save]` `[Delete]` |
| ... | ... | ... | ... | ... | ... | ... |

    *   **Inline Editing:** The `Specific Price`, `Effective From`, and `Effective To` fields can be edited directly in the table row. Clicking away or pressing Enter would trigger a save for that row.

#### Import/Export Workflow

This workflow is critical for managing large price lists efficiently.

1.  **Export (Getting the Template):**
    *   The user clicks the `[↓ Export Prices]` button.
    *   The system generates and downloads a CSV file (`Client-A_prices_2025-10-22.csv`).
    *   This file contains the current list and also serves as a perfect template for re-uploading.

2.  **Import (Uploading Changes):**
    *   The user clicks the `[↑ Import Prices]` button, which opens a modal dialog.
    *   **The Modal Contains:**
        *   A "Download Template" link (in case they don't have one).
        *   A file dropzone or a "Choose File" button.
        *   An "Upload and Process" button.
    *   **Processing:**
        *   The user selects their modified CSV file (containing columns: `ProductCode`, `SpecificPrice`, `EffectiveFrom`, `EffectiveTo`) and clicks "Upload".
        *   The frontend sends the file to the `POST /api/customers/:id/prices/import` endpoint.
        *   The UI shows a loading indicator while the backend processes the file.
    *   **Completion & Feedback:**
        *   The modal updates with the results of the import job.
        *   **Success Message:** "Import Complete. 1,250 prices updated successfully."
        *   **Failure Message:** "Import Complete with Errors. 1,248 prices updated. 2 records failed. [Download Error Log]"
        *   The error log is a simple text file detailing the row number and the reason for failure (e.g., "Row 5: ProductCode 'FAKE-CODE-123' not found.").
        *   Upon closing the modal, the price list table in the background automatically refreshes to show the newly imported data.
'''
