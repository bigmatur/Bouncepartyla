import type {
  PriceCalculationInput,
  PriceCalculationResult,
} from "@/types/pricing";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateBookingPrice(
  input: PriceCalculationInput
): PriceCalculationResult {
  const rentalTaxable = input.rentalTaxable ?? true;
  const modifiersTaxable = input.modifiersTaxable ?? true;
  const deliveryTaxable = input.deliveryTaxable ?? true;

  const rentalSubtotal = roundMoney(input.rentalSubtotal);
  const modifiersSubtotal = roundMoney(input.modifiersSubtotal);
  const deliveryFee = roundMoney(input.deliveryFee);
  const discountAmount = roundMoney(input.discountAmount);
  const depositAmount = roundMoney(input.depositAmount);

  const taxableBeforeDiscount =
    (rentalTaxable ? rentalSubtotal : 0) +
    (modifiersTaxable ? modifiersSubtotal : 0) +
    (deliveryTaxable ? deliveryFee : 0);

  const taxableAmount = roundMoney(
    Math.max(taxableBeforeDiscount - discountAmount, 0)
  );

  const taxAmount = roundMoney(taxableAmount * input.taxRate);

  const nonTaxableAmount =
    (rentalTaxable ? 0 : rentalSubtotal) +
    (modifiersTaxable ? 0 : modifiersSubtotal) +
    (deliveryTaxable ? 0 : deliveryFee);

  const totalAmount = roundMoney(
    taxableAmount + taxAmount + nonTaxableAmount
  );

  const balanceDue = roundMoney(Math.max(totalAmount - depositAmount, 0));

  return {
    rentalSubtotal,
    modifiersSubtotal,
    deliveryFee,
    discountAmount,

    taxableAmount,
    taxRate: input.taxRate,
    taxAmount,

    totalAmount,
    depositAmount,
    balanceDue,
  };
}