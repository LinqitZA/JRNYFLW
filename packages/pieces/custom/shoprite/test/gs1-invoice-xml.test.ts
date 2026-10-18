/// <reference types="vitest/globals" />
import { gs1Invoice } from '../src/lib/gs1-invoice';
import { invoiceProps, lineOne, lineTwo, SENT_AT, SUPPLIER } from './fixtures/invoice';

const REF_NO = 'bdf32970-3709-5c4d-ba4c-fee13a0f11a9';

const GOLDEN = [
    '<?xml version="1.0" encoding="utf-8"?><invoiceMessage xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="urn:gs1:ecom:invoice:xsd:3"><StandardBusinessDocumentHeader xmlns="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader">',
    '  <HeaderVersion>3.2.0</HeaderVersion>',
    '  <Sender>',
    '    <Identifier Authority="SenderEAN">6009876543219</Identifier>',
    '  </Sender>',
    '  <Receiver>',
    '    <Identifier Authority="ReceiverEAN">6001234567899</Identifier>',
    '  </Receiver>',
    '  <DocumentIdentification>',
    '    <Standard>Standard</Standard>',
    '    <TypeVersion>3.2.0</TypeVersion>',
    '    <InstanceIdentifier>INV-1001</InstanceIdentifier>',
    '    <Type>Invoice</Type>',
    '    <MultipleType>false</MultipleType>',
    '    <CreationDateAndTime>2026-10-17T10:15:30+02:00</CreationDateAndTime>',
    '  </DocumentIdentification>',
    '  <Manifest />',
    '</StandardBusinessDocumentHeader>',
    '  <invoice xmlns="">',
    '    <creationDateTime>2026-10-17T00:00:00+02:00</creationDateTime>',
    '    <documentStatusCode>ORIGINAL</documentStatusCode>',
    '    <documentActionCode>ADD</documentActionCode>',
    '    <documentStructureVersion>3.2.0</documentStructureVersion>',
    '    <revisionNumber>1.0</revisionNumber>',
    '    <documentEffectiveDate>',
    '      <date>2026-10-16</date>',
    '    </documentEffectiveDate>',
    '    <avpList>',
    '      <eComStringAttributeValuePairList attributeName="InstanceIdentifier">INV-1001</eComStringAttributeValuePairList>',
    `      <eComStringAttributeValuePairList attributeName="InvoiceRefNo">${REF_NO}</eComStringAttributeValuePairList>`,
    '    </avpList>',
    '    <InvoiceIdentification>',
    '      <entityIdentification>INV-1001</entityIdentification>',
    '      <contentOwner>',
    '        <gln>6009876543219</gln>',
    '      </contentOwner>',
    '    </InvoiceIdentification>',
    '    <invoiceType>INVOICE</invoiceType>',
    '    <invoiceCurrencyCode>ZAR</invoiceCurrencyCode>',
    '    <countryOfSupplyOfGoods>ZA</countryOfSupplyOfGoods>',
    '    <buyer>',
    '      <gln>6001234567899</gln>',
    '    </buyer>',
    '    <seller>',
    '      <gln>6009876543219</gln>',
    '      <organisationDetails>',
    '        <legalRegistration>',
    '          <legalRegistrationNumber>4000000001</legalRegistrationNumber>',
    '        </legalRegistration>',
    '      </organisationDetails>',
    '    </seller>',
    '    <shipTo>',
    '      <gln>6001234567899</gln>',
    '    </shipTo>',
    '    <invoiceTotals>',
    '      <totalInvoiceAmount currencyCode="ZAR">210.10</totalInvoiceAmount>',
    '      <totalInvoiceAmountPayable currencyCode="ZAR">241.62</totalInvoiceAmountPayable>',
    '      <totalVATAmount currencyCode="ZAR">31.52</totalVATAmount>',
    '    </invoiceTotals>',
    '    <purchaseOrder>',
    '      <entityIdentification>1220000001</entityIdentification>',
    '    </purchaseOrder>',
    '    <invoice xmlns="">',
    '      <entityIdentification>INV-1001</entityIdentification>',
    '      <contentOwner>',
    '        <gln>6009876543219</gln>',
    '      </contentOwner>',
    '    </invoice>',
    '    <invoiceLineItem>',
    '      <lineItemNumber>1</lineItemNumber>',
    '      <invoicedQuantity>2.000000</invoicedQuantity>',
    '      <amountExclusiveAllowancesCharges currencyCode="ZAR">200.00</amountExclusiveAllowancesCharges>',
    '      <amountInclusiveAllowancesCharges currencyCode="ZAR">230.00</amountInclusiveAllowancesCharges>',
    '      <note languageCode="EN">Visitor Badges &amp; Lanyards PK50</note>',
    '      <transactionalTradeItem>',
    '        <gtin>06001234000013</gtin>',
    '        <transactionalItemData>',
    '          <transactionalItemWeight>',
    '            <measurementValue measurementUnitCode="EA">0</measurementValue>',
    '          </transactionalItemWeight>',
    '        </transactionalItemData>',
    '        <size>',
    '          <sizeCode>1</sizeCode>',
    '        </size>',
    '      </transactionalTradeItem>',
    '      <invoiceLineTaxInformation>',
    '        <dutyFeeTaxAmount currencyCode="ZAR">30.00</dutyFeeTaxAmount>',
    '        <dutyFeeTaxCategoryCode>STANDARD</dutyFeeTaxCategoryCode>',
    '        <dutyFeeTaxPercentage>15.00</dutyFeeTaxPercentage>',
    '        <dutyFeeTaxTypeCode>VAT</dutyFeeTaxTypeCode>',
    '      </invoiceLineTaxInformation>',
    '    </invoiceLineItem>',
    '    <invoiceLineItem>',
    '      <lineItemNumber>2</lineItemNumber>',
    '      <invoicedQuantity>1.500000</invoicedQuantity>',
    '      <amountExclusiveAllowancesCharges currencyCode="ZAR">10.10</amountExclusiveAllowancesCharges>',
    '      <amountInclusiveAllowancesCharges currencyCode="ZAR">11.62</amountInclusiveAllowancesCharges>',
    '      <note languageCode="EN">Seals &lt;red&gt; 100</note>',
    '      <transactionalTradeItem>',
    '        <gtin>06001234000020</gtin>',
    '        <transactionalItemData>',
    '          <transactionalItemWeight>',
    '            <measurementValue measurementUnitCode="EA">0</measurementValue>',
    '          </transactionalItemWeight>',
    '        </transactionalItemData>',
    '        <size>',
    '          <sizeCode>1</sizeCode>',
    '        </size>',
    '      </transactionalTradeItem>',
    '      <invoiceLineTaxInformation>',
    '        <dutyFeeTaxAmount currencyCode="ZAR">1.52</dutyFeeTaxAmount>',
    '        <dutyFeeTaxCategoryCode>STANDARD</dutyFeeTaxCategoryCode>',
    '        <dutyFeeTaxPercentage>15.00</dutyFeeTaxPercentage>',
    '        <dutyFeeTaxTypeCode>VAT</dutyFeeTaxTypeCode>',
    '      </invoiceLineTaxInformation>',
    '    </invoiceLineItem>',
    '  </invoice>',
    '</invoiceMessage>',
].join('\r\n');

function build({ overrides = {}, sentAt = SENT_AT }: { overrides?: Record<string, unknown>; sentAt?: Date } = {}): string {
    return gs1Invoice.toXml({ invoice: gs1Invoice.check(invoiceProps(overrides)), supplier: SUPPLIER, invoiceRefNo: REF_NO, sentAt });
}

describe('gs1Invoice.toXml', () => {
    test('builds the invoice message in the exact layout of Shoprite\'s sample', () => {
        expect(build()).toBe(GOLDEN);
    });

    test('uses only CR LF line breaks', () => {
        const xml = build();
        expect(xml.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    });

    test('uses the South African date and time when it is already tomorrow there', () => {
        const xml = build({ sentAt: new Date('2026-10-17T22:30:00Z') });
        expect(xml).toContain('<CreationDateAndTime>2026-10-18T00:30:00+02:00</CreationDateAndTime>');
        expect(xml).toContain('<creationDateTime>2026-10-18T00:00:00+02:00</creationDateTime>');
    });

    test('escapes XML special characters in identifiers as well as descriptions', () => {
        const xml = build({ overrides: { invoiceNumber: 'INV<1>&2', purchaseOrder: 'PO&1' } });
        expect(xml).toContain('<InstanceIdentifier>INV&lt;1&gt;&amp;2</InstanceIdentifier>');
        expect(xml).toContain('<entityIdentification>PO&amp;1</entityIdentification>');
        expect(xml).not.toContain('INV<1>');
    });

    test('writes lines in line-number order', () => {
        const xml = build({ overrides: { lines: [lineTwo(), lineOne()] } });
        expect(xml.indexOf('<lineItemNumber>1</lineItemNumber>')).toBeLessThan(xml.indexOf('<lineItemNumber>2</lineItemNumber>'));
    });
});

describe('gs1Invoice.refNo', () => {
    test('is a name-based UUID of the supplier GLN and invoice number, the same on every resend', () => {
        expect(gs1Invoice.refNo({ supplierGln: '6009876543219', invoiceNumber: 'INV-1001' })).toBe(REF_NO);
        expect(gs1Invoice.refNo({ supplierGln: '6009876543219', invoiceNumber: 'INV-1002' })).toBe('eb2aec19-f81b-5b43-9338-7d7eecb669c1');
    });
});
