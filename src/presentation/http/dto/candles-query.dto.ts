import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Contrato de transporte: la query solo tiene que traer ambos parametros como
 * texto. Si el simbolo o el timeframe no estan soportados, lo decide el
 * dominio (GetCandlesUseCase), no la capa HTTP.
 */
export class CandlesQueryDto {
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  @IsNotEmpty()
  tf!: string;
}
