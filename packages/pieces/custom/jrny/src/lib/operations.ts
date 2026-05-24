// AUTO-GENERATED from docs/integrations/jrny/integration-openapi.json by tools/generate-operations.ts. Do not edit by hand.
import { JrnyOperation } from './operation-types';

export const jrnyOperations: JrnyOperation[] = [
  {
    "name": "create_quotation",
    "displayName": "Create Quotation",
    "description": "Create a quotation via JRNYFLW integration",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/quotations",
    "tag": "Integration",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "list_quotations",
    "displayName": "List Quotations",
    "description": "List quotations",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/quotations",
    "tag": "Integration - Sales",
    "pathParams": [],
    "queryParams": [
      {
        "name": "customerCode",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "fromDate",
        "required": false
      },
      {
        "name": "toDate",
        "required": false
      },
      {
        "name": "externalRef",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_quotation",
    "displayName": "Get Quotation",
    "description": "Get quotation detail",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/quotations/{quotationNumber}",
    "tag": "Integration - Sales",
    "pathParams": [
      "quotationNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "convert_quotation",
    "displayName": "Convert Quotation",
    "description": "Convert quotation to sales order",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/quotations/{quotationNumber}/convert",
    "tag": "Integration - Sales",
    "pathParams": [
      "quotationNumber"
    ],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "list_sales_orders",
    "displayName": "List Sales Orders",
    "description": "List sales orders",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/sales-orders",
    "tag": "Integration - Sales",
    "pathParams": [],
    "queryParams": [
      {
        "name": "customerCode",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "fromDate",
        "required": false
      },
      {
        "name": "toDate",
        "required": false
      },
      {
        "name": "poReference",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "create_sales_order",
    "displayName": "Create Sales Order",
    "description": "Create sales order directly",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/sales-orders",
    "tag": "Integration - Sales",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "get_sales_order",
    "displayName": "Get Sales Order",
    "description": "Get sales order detail",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/sales-orders/{orderNumber}",
    "tag": "Integration - Sales",
    "pathParams": [
      "orderNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "confirm_sales_order",
    "displayName": "Confirm Sales Order",
    "description": "Confirm sales order",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/sales-orders/{orderNumber}/confirm",
    "tag": "Integration - Sales",
    "pathParams": [
      "orderNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "get_fulfillment_status",
    "displayName": "Get Fulfillment Status",
    "description": "Get fulfillment status",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/sales-orders/{orderNumber}/fulfillment",
    "tag": "Integration - Sales",
    "pathParams": [
      "orderNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_keys",
    "displayName": "List Keys",
    "description": "List all integration API keys for an entity",
    "method": "GET",
    "path": "/api/v1/admin/integration/keys/{entityId}",
    "tag": "Integration - Key Management",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "create_key",
    "displayName": "Create Key",
    "description": "Create a new integration API key",
    "method": "POST",
    "path": "/api/v1/admin/integration/keys/{entityId}",
    "tag": "Integration - Key Management",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "get_key",
    "displayName": "Get Key",
    "description": "Get a single integration API key",
    "method": "GET",
    "path": "/api/v1/admin/integration/keys/{entityId}/{keyId}",
    "tag": "Integration - Key Management",
    "pathParams": [
      "keyId"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "update_key",
    "displayName": "Update Key",
    "description": "Update integration API key metadata",
    "method": "PATCH",
    "path": "/api/v1/admin/integration/keys/{entityId}/{keyId}",
    "tag": "Integration - Key Management",
    "pathParams": [
      "keyId"
    ],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "revoke_key",
    "displayName": "Revoke Key",
    "description": "Revoke an integration API key",
    "method": "DELETE",
    "path": "/api/v1/admin/integration/keys/{entityId}/{keyId}",
    "tag": "Integration - Key Management",
    "pathParams": [
      "keyId"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "rotate_key",
    "displayName": "Rotate Key",
    "description": "Rotate an integration API key (zero-downtime)",
    "method": "POST",
    "path": "/api/v1/admin/integration/keys/{entityId}/{keyId}/rotate",
    "tag": "Integration - Key Management",
    "pathParams": [
      "keyId"
    ],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "cancel_rotation",
    "displayName": "Cancel Rotation",
    "description": "Cancel a pending key rotation",
    "method": "DELETE",
    "path": "/api/v1/admin/integration/keys/{entityId}/{keyId}/rotate",
    "tag": "Integration - Key Management",
    "pathParams": [
      "keyId"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_subscriptions",
    "displayName": "List Subscriptions",
    "description": "List all webhook subscriptions for an entity",
    "method": "GET",
    "path": "/api/v1/admin/integration/webhooks/{entityId}",
    "tag": "Integration - Webhook Subscriptions",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "create_subscription",
    "displayName": "Create Subscription",
    "description": "Create a new webhook subscription",
    "method": "POST",
    "path": "/api/v1/admin/integration/webhooks/{entityId}",
    "tag": "Integration - Webhook Subscriptions",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "list_event_types",
    "displayName": "List Event Types",
    "description": "List all supported webhook event types",
    "method": "GET",
    "path": "/api/v1/admin/integration/webhooks/{entityId}/event-types",
    "tag": "Integration - Webhook Subscriptions",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "get_subscription",
    "displayName": "Get Subscription",
    "description": "Get a single webhook subscription with delivery log",
    "method": "GET",
    "path": "/api/v1/admin/integration/webhooks/{entityId}/{subscriptionId}",
    "tag": "Integration - Webhook Subscriptions",
    "pathParams": [
      "subscriptionId"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "update_subscription",
    "displayName": "Update Subscription",
    "description": "Update a webhook subscription",
    "method": "PATCH",
    "path": "/api/v1/admin/integration/webhooks/{entityId}/{subscriptionId}",
    "tag": "Integration - Webhook Subscriptions",
    "pathParams": [
      "subscriptionId"
    ],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "delete_subscription",
    "displayName": "Delete Subscription",
    "description": "Delete a webhook subscription",
    "method": "DELETE",
    "path": "/api/v1/admin/integration/webhooks/{entityId}/{subscriptionId}",
    "tag": "Integration - Webhook Subscriptions",
    "pathParams": [
      "subscriptionId"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "send_test_ping",
    "displayName": "Send Test Ping",
    "description": "Send a test ping to a webhook subscription",
    "method": "POST",
    "path": "/api/v1/admin/integration/webhooks/{entityId}/{subscriptionId}/ping",
    "tag": "Integration - Webhook Subscriptions",
    "pathParams": [
      "subscriptionId"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_entities",
    "displayName": "List Entities",
    "description": "List entities accessible to the API key",
    "method": "GET",
    "path": "/api/v1/integration/entities",
    "tag": "Integration",
    "pathParams": [],
    "queryParams": [
      {
        "name": "type",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_stats",
    "displayName": "Get Stats",
    "description": "Get integration activity KPI metrics",
    "method": "GET",
    "path": "/api/v1/admin/integration/activity/{entityId}/stats",
    "tag": "Integration - Activity Dashboard",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "get_recent_calls",
    "displayName": "Get Recent Calls",
    "description": "Get recent integration API calls",
    "method": "GET",
    "path": "/api/v1/admin/integration/activity/{entityId}/calls",
    "tag": "Integration - Activity Dashboard",
    "pathParams": [],
    "queryParams": [
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_webhook_chart",
    "displayName": "Get Webhook Chart",
    "description": "Get webhook delivery chart data (daily breakdown)",
    "method": "GET",
    "path": "/api/v1/admin/integration/activity/{entityId}/webhooks/chart",
    "tag": "Integration - Activity Dashboard",
    "pathParams": [],
    "queryParams": [
      {
        "name": "days",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_error_breakdown",
    "displayName": "Get Error Breakdown",
    "description": "Get integration error breakdown",
    "method": "GET",
    "path": "/api/v1/admin/integration/activity/{entityId}/errors",
    "tag": "Integration - Activity Dashboard",
    "pathParams": [],
    "queryParams": [
      {
        "name": "days",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_rate_limit_utilization",
    "displayName": "Get Rate Limit Utilization",
    "description": "Get rate limit utilization per API key",
    "method": "GET",
    "path": "/api/v1/admin/integration/activity/{entityId}/rate-limits",
    "tag": "Integration - Activity Dashboard",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_dispatch_notes",
    "displayName": "List Dispatch Notes",
    "description": "List dispatch notes for the entity",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/dispatch-notes",
    "tag": "Integration",
    "pathParams": [],
    "queryParams": [
      {
        "name": "customerCode",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "salesOrderNumber",
        "required": false
      },
      {
        "name": "waybillNumber",
        "required": false
      },
      {
        "name": "fromDate",
        "required": false
      },
      {
        "name": "toDate",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_dispatch_note",
    "displayName": "Get Dispatch Note",
    "description": "Get dispatch note detail with cartons",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/dispatch-notes/{dispatchNumber}",
    "tag": "Integration",
    "pathParams": [
      "dispatchNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "courier_response",
    "displayName": "Courier Response",
    "description": "Courier response callback",
    "method": "PATCH",
    "path": "/api/v1/integration/entities/{entityId}/dispatch-notes/{dispatchNumber}/courier-response",
    "tag": "Integration",
    "pathParams": [
      "dispatchNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_customers",
    "displayName": "List Customers",
    "description": "List customers",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/customers",
    "tag": "Integration — Customers",
    "pathParams": [],
    "queryParams": [
      {
        "name": "search",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "branchId",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "create_customer",
    "displayName": "Create Customer",
    "description": "Create a new customer",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/customers",
    "tag": "Integration — Customers",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "get_customer",
    "displayName": "Get Customer",
    "description": "Get customer by account code",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}",
    "tag": "Integration — Customers",
    "pathParams": [
      "code"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "update_customer",
    "displayName": "Update Customer",
    "description": "Update customer fields",
    "method": "PATCH",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}",
    "tag": "Integration — Customers",
    "pathParams": [
      "code"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_addresses",
    "displayName": "List Addresses",
    "description": "List customer delivery addresses",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}/addresses",
    "tag": "Integration — Customers",
    "pathParams": [
      "code"
    ],
    "queryParams": [
      {
        "name": "activeOnly",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "add_address",
    "displayName": "Add Address",
    "description": "Add a delivery address",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}/addresses",
    "tag": "Integration — Customers",
    "pathParams": [
      "code"
    ],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "update_address",
    "displayName": "Update Address",
    "description": "Update a delivery address",
    "method": "PATCH",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}/addresses/{addressCode}",
    "tag": "Integration — Customers",
    "pathParams": [
      "code",
      "addressCode"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_contacts",
    "displayName": "List Contacts",
    "description": "List customer contacts",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}/contacts",
    "tag": "Integration — Customers",
    "pathParams": [
      "code"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "add_contact",
    "displayName": "Add Contact",
    "description": "Add a customer contact",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}/contacts",
    "tag": "Integration — Customers",
    "pathParams": [
      "code"
    ],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "get_ageing",
    "displayName": "Get Ageing",
    "description": "Customer ageing buckets",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}/ageing",
    "tag": "Integration — Customers",
    "pathParams": [
      "code"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "get_statement",
    "displayName": "Get Statement",
    "description": "Customer statement",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}/statement",
    "tag": "Integration — Customers",
    "pathParams": [
      "code"
    ],
    "queryParams": [
      {
        "name": "fromDate",
        "required": false
      },
      {
        "name": "toDate",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_balance",
    "displayName": "Get Balance",
    "description": "Customer balance and credit summary",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}/balance",
    "tag": "Integration — Customers",
    "pathParams": [
      "code"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_products",
    "displayName": "List Products",
    "description": "List products",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/products",
    "tag": "Integration — Products & Inventory",
    "pathParams": [],
    "queryParams": [
      {
        "name": "search",
        "required": false
      },
      {
        "name": "categoryId",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "create_product",
    "displayName": "Create Product",
    "description": "Create a new product",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/products",
    "tag": "Integration — Products & Inventory",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "get_product",
    "displayName": "Get Product",
    "description": "Get product by stock code",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/products/{stockCode}",
    "tag": "Integration — Products & Inventory",
    "pathParams": [
      "stockCode"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "update_product",
    "displayName": "Update Product",
    "description": "Update product fields",
    "method": "PATCH",
    "path": "/api/v1/integration/entities/{entityId}/products/{stockCode}",
    "tag": "Integration — Products & Inventory",
    "pathParams": [
      "stockCode"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "get_product_stock",
    "displayName": "Get Product Stock",
    "description": "Stock on hand for a product",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/products/{stockCode}/stock",
    "tag": "Integration — Products & Inventory",
    "pathParams": [
      "stockCode"
    ],
    "queryParams": [
      {
        "name": "warehouseId",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_bulk_stock_on_hand",
    "displayName": "Get Bulk Stock On Hand",
    "description": "Bulk stock on hand query",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/stock-on-hand",
    "tag": "Integration — Products & Inventory",
    "pathParams": [],
    "queryParams": [
      {
        "name": "warehouseId",
        "required": false
      },
      {
        "name": "branchId",
        "required": false
      },
      {
        "name": "stockCodes",
        "required": false
      },
      {
        "name": "belowReorder",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_product_pricing",
    "displayName": "Get Product Pricing",
    "description": "Resolve product pricing",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/products/{stockCode}/pricing",
    "tag": "Integration — Products & Inventory",
    "pathParams": [
      "stockCode"
    ],
    "queryParams": [
      {
        "name": "customerCode",
        "required": false
      },
      {
        "name": "quantity",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "list_currencies",
    "displayName": "List Currencies",
    "description": "List active currencies",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/ref/currencies",
    "tag": "Integration",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_tax_codes",
    "displayName": "List Tax Codes",
    "description": "List tax codes",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/ref/tax-codes",
    "tag": "Integration",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_payment_terms",
    "displayName": "List Payment Terms",
    "description": "List payment terms",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/ref/payment-terms",
    "tag": "Integration",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_uom",
    "displayName": "List Uom",
    "description": "List units of measure",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/ref/uom",
    "tag": "Integration",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_warehouses",
    "displayName": "List Warehouses",
    "description": "List warehouses for entity",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/ref/warehouses",
    "tag": "Integration",
    "pathParams": [],
    "queryParams": [
      {
        "name": "branchId",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "list_branches",
    "displayName": "List Branches",
    "description": "List branches for entity",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/ref/branches",
    "tag": "Integration",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_product_categories",
    "displayName": "List Product Categories",
    "description": "List product categories (groups) as a tree",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/ref/product-categories",
    "tag": "Integration",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_vendors",
    "displayName": "List Vendors",
    "description": "List vendors",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/vendors",
    "tag": "Integration - Procurement",
    "pathParams": [],
    "queryParams": [
      {
        "name": "search",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "create_vendor",
    "displayName": "Create Vendor",
    "description": "Create vendor",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/vendors",
    "tag": "Integration - Procurement",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "get_vendor",
    "displayName": "Get Vendor",
    "description": "Get vendor detail",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/vendors/{vendorCode}",
    "tag": "Integration - Procurement",
    "pathParams": [
      "vendorCode"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "update_vendor",
    "displayName": "Update Vendor",
    "description": "Update vendor",
    "method": "PATCH",
    "path": "/api/v1/integration/entities/{entityId}/vendors/{vendorCode}",
    "tag": "Integration - Procurement",
    "pathParams": [
      "vendorCode"
    ],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "get_vendor_contacts",
    "displayName": "Get Vendor Contacts",
    "description": "Get vendor contacts",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/vendors/{vendorCode}/contacts",
    "tag": "Integration - Procurement",
    "pathParams": [
      "vendorCode"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "add_vendor_contact",
    "displayName": "Add Vendor Contact",
    "description": "Add vendor contact",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/vendors/{vendorCode}/contacts",
    "tag": "Integration - Procurement",
    "pathParams": [
      "vendorCode"
    ],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "list_purchase_orders",
    "displayName": "List Purchase Orders",
    "description": "List purchase orders",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/purchase-orders",
    "tag": "Integration - Procurement",
    "pathParams": [],
    "queryParams": [
      {
        "name": "vendorCode",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "fromDate",
        "required": false
      },
      {
        "name": "toDate",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "create_purchase_order",
    "displayName": "Create Purchase Order",
    "description": "Create purchase order",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/purchase-orders",
    "tag": "Integration - Procurement",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "get_purchase_order",
    "displayName": "Get Purchase Order",
    "description": "Get purchase order detail",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/purchase-orders/{poNumber}",
    "tag": "Integration - Procurement",
    "pathParams": [
      "poNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "update_purchase_order",
    "displayName": "Update Purchase Order",
    "description": "Update draft purchase order",
    "method": "PATCH",
    "path": "/api/v1/integration/entities/{entityId}/purchase-orders/{poNumber}",
    "tag": "Integration - Procurement",
    "pathParams": [
      "poNumber"
    ],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "submit_purchase_order",
    "displayName": "Submit Purchase Order",
    "description": "Submit purchase order for approval",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/purchase-orders/{poNumber}/submit",
    "tag": "Integration - Procurement",
    "pathParams": [
      "poNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_grns",
    "displayName": "List Grns",
    "description": "List goods received notes",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/grns",
    "tag": "Integration - Procurement",
    "pathParams": [],
    "queryParams": [
      {
        "name": "poNumber",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "fromDate",
        "required": false
      },
      {
        "name": "toDate",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "create_grn",
    "displayName": "Create Grn",
    "description": "Create goods received note",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/grns",
    "tag": "Integration - Procurement",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "get_grn",
    "displayName": "Get Grn",
    "description": "Get GRN detail",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/grns/{grnNumber}",
    "tag": "Integration - Procurement",
    "pathParams": [
      "grnNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_supplier_invoices",
    "displayName": "List Supplier Invoices",
    "description": "List supplier invoices",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/supplier-invoices",
    "tag": "Integration - Procurement",
    "pathParams": [],
    "queryParams": [
      {
        "name": "vendorCode",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "fromDate",
        "required": false
      },
      {
        "name": "toDate",
        "required": false
      },
      {
        "name": "poNumber",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "create_supplier_invoice",
    "displayName": "Create Supplier Invoice",
    "description": "Create supplier invoice",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/supplier-invoices",
    "tag": "Integration - Procurement",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true
  },
  {
    "name": "get_supplier_invoice",
    "displayName": "Get Supplier Invoice",
    "description": "Get supplier invoice detail",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/supplier-invoices/{invoiceNumber}",
    "tag": "Integration - Procurement",
    "pathParams": [
      "invoiceNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "post_supplier_invoice",
    "displayName": "Post Supplier Invoice",
    "description": "Post supplier invoice",
    "method": "POST",
    "path": "/api/v1/integration/entities/{entityId}/supplier-invoices/{invoiceNumber}/post",
    "tag": "Integration - Procurement",
    "pathParams": [
      "invoiceNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_price_lists",
    "displayName": "List Price Lists",
    "description": "List price lists",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/price-lists",
    "tag": "Integration — Pricing & Contracts",
    "pathParams": [],
    "queryParams": [
      {
        "name": "currency",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_price_list",
    "displayName": "Get Price List",
    "description": "Get price list by code with lines",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/price-lists/{code}",
    "tag": "Integration — Pricing & Contracts",
    "pathParams": [
      "code"
    ],
    "queryParams": [
      {
        "name": "search",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_customer_contract_pricing",
    "displayName": "Get Customer Contract Pricing",
    "description": "Customer contract pricing",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}/contract-pricing",
    "tag": "Integration — Pricing & Contracts",
    "pathParams": [
      "code"
    ],
    "queryParams": [
      {
        "name": "status",
        "required": false
      },
      {
        "name": "productCode",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_customer_resolved_prices",
    "displayName": "Get Customer Resolved Prices",
    "description": "Resolved prices for a customer",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/customers/{code}/resolved-prices",
    "tag": "Integration — Pricing & Contracts",
    "pathParams": [
      "code"
    ],
    "queryParams": [
      {
        "name": "quantity",
        "required": false
      },
      {
        "name": "stockCodes",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "list_invoices",
    "displayName": "List Invoices",
    "description": "List AR invoices",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/invoices",
    "tag": "Integration - Finance",
    "pathParams": [],
    "queryParams": [
      {
        "name": "customerCode",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "fromDate",
        "required": false
      },
      {
        "name": "toDate",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_invoice",
    "displayName": "Get Invoice",
    "description": "Get invoice detail",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/invoices/{invoiceNumber}",
    "tag": "Integration - Finance",
    "pathParams": [
      "invoiceNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_credit_notes",
    "displayName": "List Credit Notes",
    "description": "List credit notes",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/credit-notes",
    "tag": "Integration - Finance",
    "pathParams": [],
    "queryParams": [
      {
        "name": "customerCode",
        "required": false
      },
      {
        "name": "fromDate",
        "required": false
      },
      {
        "name": "toDate",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_credit_note",
    "displayName": "Get Credit Note",
    "description": "Get credit note detail",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/credit-notes/{creditNoteNumber}",
    "tag": "Integration - Finance",
    "pathParams": [
      "creditNoteNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "list_payments",
    "displayName": "List Payments",
    "description": "List customer payments",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/payments",
    "tag": "Integration - Finance",
    "pathParams": [],
    "queryParams": [
      {
        "name": "customerCode",
        "required": false
      },
      {
        "name": "status",
        "required": false
      },
      {
        "name": "fromDate",
        "required": false
      },
      {
        "name": "toDate",
        "required": false
      },
      {
        "name": "cursor",
        "required": false
      },
      {
        "name": "limit",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_payment",
    "displayName": "Get Payment",
    "description": "Get payment detail",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/payments/{paymentNumber}",
    "tag": "Integration - Finance",
    "pathParams": [
      "paymentNumber"
    ],
    "queryParams": [],
    "hasBody": false
  },
  {
    "name": "get_aged_debtors",
    "displayName": "Get Aged Debtors",
    "description": "Aged debtors report",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/aged-debtors",
    "tag": "Integration - Finance",
    "pathParams": [],
    "queryParams": [
      {
        "name": "asAtDate",
        "required": false
      },
      {
        "name": "branchId",
        "required": false
      }
    ],
    "hasBody": false
  },
  {
    "name": "get_aged_creditors",
    "displayName": "Get Aged Creditors",
    "description": "Aged creditors report",
    "method": "GET",
    "path": "/api/v1/integration/entities/{entityId}/aged-creditors",
    "tag": "Integration - Finance",
    "pathParams": [],
    "queryParams": [
      {
        "name": "asAtDate",
        "required": false
      },
      {
        "name": "branchId",
        "required": false
      }
    ],
    "hasBody": false
  }
];
