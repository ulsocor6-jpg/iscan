export function generatePickupCode()
{
    const random =
    Math.floor(
        100000 + Math.random()*900000
    );

    return `ISCAN-${random}`;
}
