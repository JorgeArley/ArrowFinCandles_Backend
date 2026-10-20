import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Transport contract: the query only has to bring both parameters as text.
 * Whether the symbol or the timeframe are supported is decided by the domain
 * (GetCandlesUseCase), not by the HTTP layer.
 */
export class CandlesQueryDto {
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  @IsNotEmpty()
  tf!: string;
}
