const ZERO_DISCOUNTS = [
    ['B', 'Backhaul Allowance'], ['C', 'Efficiency Allowance'], ['D', 'Port Direct Allowance'], ['F', 'Ex-Factory Allowance'],
    ['S1', 'Bulk Order Allowance'], ['S2', 'Warehouse Allowance'], ['SA', 'Swell Allowance'], ['T1', 'Trade Discount 1'],
    ['T2', 'Trade Discount 2'], ['T3', 'Return Centre Allowance'],
];

export function gs1Document({ orders }: { orders: unknown[] }) {
    return {
        standardBusinessDocumentHeaderField: {
            headerVersionField: '3.2',
            documentIdentificationField: {
                standardField: 'GS1', typeField: 'Order', creationDateAndTimeField: '2026-10-16T16:00:19.7071905+02:00',
                instanceIdentifierField: '',
            },
            manifestField: { numberOfItemsField: String(orders.length), manifestItemField: null },
        },
        orderField: orders,
    };
}

export function gs1Order({ orderNumber, headerId = '242306305', branch = '1608', storeName = 'TEST STORE ONE', gln = '6001001016001', orderDate = '2026-10-16', orderType = '220', lines }: Gs1OrderInput) {
    return {
        orderIdentificationField: {
            entityIdentificationField: orderNumber,
            contentOwnerField: { glnField: null, additionalPartyIdentificationField: [partyId({ type: 'BUYER_ASSIGNED_ORDER_HEADERID', value: headerId })] },
        },
        orderTypeCodeField: { codeListVersionField: 'Normal', valueField: orderType },
        totalMonetaryAmountExcludingTaxesField: null,
        totalMonetaryAmountIncludingTaxesField: null,
        buyerField: {
            glnField: gln,
            additionalPartyIdentificationField: [
                partyId({ type: 'BUYER_ASSIGNED_IDENTIFIER_FOR_A_PARTY', value: branch }),
                partyId({ type: 'BUYER_ASSIGNED_DESCRIPTION_FOR_A_PARTY', value: storeName }),
            ],
            addressField: null,
        },
        sellerField: { glnField: '6001651203943', additionalPartyIdentificationField: [partyId({ type: 'BUYER_ASSIGNED_VENDOR_ID', value: '242626' })] },
        orderLineItemField: lines,
        avpListField: null,
        creationDateTimeField: `${orderDate}T00:00:00`,
        documentStatusCodeField: 2,
    };
}

export function gs1Line({ lineNumber, supplierCode, gtin, buyerCode = '10367034', description, quantity, unitExcl, unitIncl, deliveryDate = '2026-10-19', shipToGln = '6001001016001', shipToBranch = '1608', discounts = {}, withDetail = true }: Gs1LineInput) {
    return {
        lineItemNumberField: String(lineNumber),
        parentLineItemNumberField: null,
        ShipToLocation: 0,
        requestedQuantityField: { measurementUnitCodeField: null, codeListVersionField: null, valueField: quantity },
        netAmountField: money(roundTo2(Number(quantity) * Number(unitExcl))),
        netPriceField: money(roundTo2(Number(quantity) * Number(unitIncl))),
        monetaryAmountExcludingTaxesField: money(unitExcl),
        monetaryAmountIncludingTaxesField: money(unitIncl),
        transactionalTradeItemField: {
            tradeItemDescriptionField: { languageCodeField: null, codeListVersionField: null, valueField: description },
            gtinField: gtin,
            additionalTradeItemIdentificationField: [
                tradeId({ type: 'SUPPLIER_ASSIGNED_ITEMID', value: supplierCode }),
                tradeId({ type: 'BUYER_ASSIGNED_ITEMID', value: buyerCode }),
                tradeId({ type: 'BUYER_ASSIGNED_ITEM_DESCRIPTION', value: description }),
            ],
        },
        orderLineItemDetailField: withDetail ? [{
            requestedQuantityField: { measurementUnitCodeField: null, codeListVersionField: null, valueField: quantity },
            orderLogisticalInformationField: {
                shipFromField: null,
                shipToField: {
                    glnField: shipToGln,
                    additionalPartyIdentificationField: [
                        partyId({ type: 'BUYER_ASSIGNED_BRANCH_NUMBER', value: shipToBranch }),
                        partyId({ type: 'BUYER_ASSIGNED_BRANCH_DESCRIPTION', value: 'TEST STORE' }),
                    ],
                },
                orderLogisticalDateInformationField: {
                    requestedDeliveryDateRangeField: null,
                    requestedDeliveryDateTimeField: { dateField: `${deliveryDate}T00:00:00`, timeField: '0001-01-01T00:00:00', timeFieldSpecified: false },
                },
            },
            avpListField: ZERO_DISCOUNTS.map(([code, name]) => ({
                attributeNameField: 'ORDER_DISCOUNT', qualifierCodeNameField: 'Discount Indicator', qualifierCodeListField: code,
                qualifierCodeListVersionField: name, valueField: discounts[code] ?? '0.00',
            })),
        }] : null,
        avpListField: [
            { attributeNameField: 'BUYER_ASSIGNED_COSTPER', qualifierCodeNameField: null, qualifierCodeListField: null, qualifierCodeListVersionField: null, valueField: '1' },
            { attributeNameField: 'BUYER_ASSIGNED_UNITOFMEASURE', qualifierCodeNameField: null, qualifierCodeListField: null, qualifierCodeListVersionField: null, valueField: 'EA' },
        ],
    };
}

function partyId({ type, value }: { type: string; value: string }) {
    return { additionalPartyIdentificationTypeCodeField: type, codeListVersionField: null, valueField: value };
}

function tradeId({ type, value }: { type: string; value: string }) {
    return { additionalTradeItemIdentificationTypeCodeField: type, codeListVersionField: null, valueField: value };
}

function money(value: number | string) {
    return { currencyCodeField: 'ZAR', codeListVersionField: null, valueField: value };
}

function roundTo2(value: number): number {
    return Math.round(value * 100) / 100;
}

type Gs1OrderInput = { orderNumber: string; headerId?: string; branch?: string; storeName?: string; gln?: string; orderDate?: string; orderType?: string; lines: unknown[] };
type Gs1LineInput = {
    lineNumber: number; supplierCode: string; gtin: string; buyerCode?: string; description: string;
    quantity: number | string; unitExcl: number | string; unitIncl: number | string; deliveryDate?: string;
    shipToGln?: string; shipToBranch?: string; discounts?: Record<string, string>; withDetail?: boolean;
};
