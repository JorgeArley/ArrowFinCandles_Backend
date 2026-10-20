import { Controller, Get, Query } from '@nestjs/common';
import { GetCandlesUseCase } from '../../application/candles/get-candles.use-case';
import type { CandlesResponse } from '../../domain/candles/candle';
import { CandlesQueryDto } from './dto/candles-query.dto';

@Controller('candles')
export class CandlesController {
  constructor(private readonly getCandlesUseCase: GetCandlesUseCase) {}

  @Get()
  getCandles(@Query() query: CandlesQueryDto): CandlesResponse {
    return this.getCandlesUseCase.execute(query);
  }
}
