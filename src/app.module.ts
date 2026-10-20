import { Module } from '@nestjs/common';
import { GetCandlesUseCase } from './application/candles/get-candles.use-case';
import { CANDLE_REPOSITORY } from './domain/candles/candle-repository';
import { JsonCandleRepository } from './infrastructure/persistence/json-candle-repository';
import { CandlesController } from './presentation/http/candles.controller';

/**
 * Composition root: aqui se conectan las piezas. La capa de aplicacion pide un
 * CandleRepository (puerto del dominio) y recibe la implementacion de
 * infraestructura, de modo que las dependencias apuntan hacia dentro.
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
