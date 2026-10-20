import { Module } from '@nestjs/common';
import { GetCandlesUseCase } from './application/candles/get-candles.use-case';
import { CANDLE_REPOSITORY } from './domain/candles/candle-repository';
import { JsonCandleRepository } from './infrastructure/persistence/json-candle-repository';
import { CandlesController } from './presentation/http/candles.controller';

/**
 * Composition root: this is where the pieces are wired together. The
 * application layer asks for a CandleRepository (a domain port) and receives
 * the infrastructure implementation, so dependencies point inwards.
 */
@Module({
  controllers: [CandlesController],
  providers: [
    { provide: CANDLE_REPOSITORY, useClass: JsonCandleRepository },
    {
      provide: GetCandlesUseCase,
      useFactory: (candles: JsonCandleRepository) =>
        new GetCandlesUseCase(candles),
      inject: [CANDLE_REPOSITORY],
    },
  ],
})
export class AppModule {}
