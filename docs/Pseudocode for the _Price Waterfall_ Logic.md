'''pseudocode
# Pseudocode for the "Price Waterfall" Logic

**Location:** `backend/src/services/pricing.service.js`

**Function Signature:** `function getProductPriceForCustomer(productID, customerID)`

```
FUNCTION getProductPriceForCustomer(productID, customerID):

  // Get current date for checking effective price ranges
  currentDate = GET_CURRENT_DATE()

  // --- LEVEL 1: Check for a specific Customer-Product Contract Price ---
  // This is the highest priority price.
  
  contractPrice = QUERY_DATABASE("CustomerProductPrices")
    .WHERE("CustomerID" = customerID)
    .AND("ProductID" = productID)
    .AND("EffectiveFrom" <= currentDate)
    .AND("EffectiveTo" >= currentDate OR "EffectiveTo" IS NULL)
    .ORDER_BY("EffectiveFrom" DESC) // Get the most recent effective price
    .FIRST()

  IF contractPrice IS FOUND:
    RETURN { 
      price: contractPrice.SpecificPrice, 
      source: "CONTRACT"
    }
  END IF

  // --- LEVEL 2: Check the Customer's assigned Price List ---
  // If no contract price, find the price from the customer's default price list (e.g., "Wholesale").

  // First, get the customer's assigned PriceListID
  customer = QUERY_DATABASE("Customers")
    .SELECT("PriceListID")
    .WHERE("CustomerID" = customerID)
    .FIRST()

  IF customer IS NOT FOUND OR customer.PriceListID IS NULL:
    // If customer has no assigned price list, we can't check this level.
    // Proceed directly to Level 3.
    GOTO LEVEL_3
  END IF

  priceListPrice = QUERY_DATABASE("PriceListItems")
    .WHERE("PriceListID" = customer.PriceListID)
    .AND("ProductID" = productID)
    .AND("EffectiveFrom" <= currentDate)
    .AND("EffectiveTo" >= currentDate OR "EffectiveTo" IS NULL)
    .ORDER_BY("EffectiveFrom" DESC)
    .FIRST()

  IF priceListPrice IS FOUND:
    RETURN { 
      price: priceListPrice.Price, 
      source: "PRICELIST"
    }
  END IF

  // --- LEVEL 3: Use the Product's Base Price ---
  // This is the fallback, default price if no other price is found.
  LABEL LEVEL_3:
  
  product = QUERY_DATABASE("Products")
    .SELECT("BasePrice")
    .WHERE("ProductID" = productID)
    .FIRST()

  IF product IS FOUND AND product.BasePrice IS NOT NULL:
    RETURN { 
      price: product.BasePrice, 
      source: "BASE"
    }
  ELSE:
    // Handle case where even a base price is not found (should be rare)
    RETURN { 
      price: 0.00, 
      source: "NOT_FOUND",
      error: "No valid price could be determined for this product."
    }
  END IF

END FUNCTION
```

### How it's used in the "Create Order" screen:

When a salesperson adds a product to a new order:

1.  The frontend calls an API endpoint like `POST /api/orders/:orderId/items` with `{ productID, quantity }`.
2.  The `order.controller.js` receives this request.
3.  The controller calls the `pricing.service.js` -> `getProductPriceForCustomer(productID, customerID)`.
4.  The service executes the waterfall logic above and returns the final price and its source.
5.  The controller then adds the item to the `OrderItems` table, storing the determined `UnitPrice` and the `PriceSource` ('CONTRACT', 'PRICELIST', or 'BASE') for auditing and reporting purposes.
'''
