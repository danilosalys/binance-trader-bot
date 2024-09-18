require("dotenv").config();
const config = require("./config.json");
const Binance = require("binance-api-node").default;
const { RSI, MACD, BollingerBands, EMA, SMA } = require("technicalindicators");

// Conecta à API da Binance usando as chaves de API e segredo
const client = Binance({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.SECRET_KEY,
});

// Função para verificar o saldo da conta e filtrar BTC e BRL
const checkBalance = async () => {
  try {
    const accountInfo = await client.accountInfo();
    const balances = accountInfo.balances;

    // Filtra os saldos de BTC e BRL
    const btcBalance = balances.find((b) => b.asset === "BTC");
    const brlBalance = balances.find((b) => b.asset === "BRL");

    console.log("Saldo BTC:", btcBalance ? btcBalance.free : "0");
    console.log("Saldo BRL:", brlBalance ? brlBalance.free : "0");
  } catch (error) {
    console.error("Erro ao buscar o saldo:", error);
  }
};

// Função para obter o preço atual do Bitcoin
const getBitcoinPrice = async () => {
  try {
    // Pega os preços do par BTC/USDT (ou BTC/BRL se preferir)
    const prices = await client.prices();

    const btcPriceInUSDT = prices.BTCUSDT; // Preço em USD
    const btcPriceInBRL = prices.BTCBRL; // Preço em BRL (se disponível)

    console.log("Preço atual do Bitcoin (BTC/USDT):", btcPriceInUSDT);
    if (btcPriceInBRL) {
      console.log("Preço atual do Bitcoin (BTC/BRL):", btcPriceInBRL);
    } else {
      console.log("Preço BTC/BRL não disponível.");
    }
  } catch (error) {
    console.error("Erro ao buscar o preço do Bitcoin:", error);
  }
};

//Função para obter da data configurada no Json em formato timestamp (TimeZone de Brasilia)


//Função para obter o timestamp da data configurada no Json (TimeZone de Brasilia)
const getStartTimestamp = (dateString) => {
	const date = new Date(dateString);
	return date.getTime();
  }
  

// Função para obter os candles históricos
// Função para obter os candles históricos
const getCandleData = async (symbol, interval, limit, startTime, endTime) => {
	try {
	  const candles = await client.candles({
		symbol: symbol,
		interval: interval,
		limit: limit,
		startTime: startTime,
		endTime: endTime,
	  });
    
	  // Adicionando candleTimeBrasilia para cada candle
	  const candlesWithBrasiliaTime = candles.map(candle => {
		const candleTimeBrasilia = new Date(candle.openTime - config.timeZoneBrasiliaTimestamp).toISOString(); // Converte para horário de Brasília
		return {
		  ...candle, // Mantém os dados originais
		  candleTimeBrasilia // Adiciona o campo candleTimeBrasilia
		};
	  });
  
	  // Exibindo o primeiro candle para verificar o resultado
	  console.log(candlesWithBrasiliaTime.length);
		console.log(candlesWithBrasiliaTime[0].candleTimeBrasilia);
		console.log(candlesWithBrasiliaTime[499].candleTimeBrasilia);

	  
	  return candlesWithBrasiliaTime;
	} catch (error) {
	  console.error("Erro ao buscar dados de candlestick:", error);
	}
  };
  

// Função para calcular o RSI
const calculateRSI = (closePrices, period) => {
  return RSI.calculate({
    values: closePrices,
    period: period,
  });
};

// Função para calcular o MACD
const calculateMACD = (closePrices, fastPeriod, slowPeriod, signalPeriod) => {
  return MACD.calculate({
    values: closePrices,
    fastPeriod: fastPeriod,
    slowPeriod: slowPeriod,
    signalPeriod: signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
};

// Função para calcular as Bollinger Bands
const calculateBollingerBands = (closePrices, period, stdDev) => {
  return BollingerBands.calculate({
    values: closePrices,
    period: period,
    stdDev: stdDev,
  });
};

// Função para analisar volume
const analyzeVolume = (candles) => {
  const volumes = candles.map((candle) => parseFloat(candle.volume));
  const avgVolume = volumes.reduce((a, b) => a + b) / volumes.length;
  const latestVolume = volumes[volumes.length - 1];
  return { avgVolume, latestVolume };
};

const calculateSupport = async (candles) => {
	const last50Candles = candles.slice(-50); // Seleciona os últimos 50 candles
	const lowPrices = last50Candles.map((candle) => parseFloat(candle.low)); // Pega os preços mínimos dos 50 candles
	const supportLevel = Math.min(...lowPrices); // Encontra o menor valor (suporte)
	return supportLevel;
  };

// Função para calcular a SMA
const calculateSMA = (closePrices, period) => {
  return SMA.calculate({
    values: closePrices,
    period: period,
  });
};

// Função para calcular a EMA
const calculateEMA = (closePrices, period) => {
  return EMA.calculate({
    values: closePrices,
    period: period,
  });
};

// Função para detectar Doji
const isDoji = (candles) => {
  const lastCandle = candles[candles.length - 1];
  const bodySize = Math.abs(
    parseFloat(lastCandle.open) - parseFloat(lastCandle.close)
  );
  const candleRange = parseFloat(lastCandle.high) - parseFloat(lastCandle.low);

  // O Doji ocorre quando o corpo do candle é muito pequeno em relação à sua faixa total
  return bodySize <= 0.1 * candleRange;
};

// Função para verificar divergência de alta no RSI
const checkRSIDivergence = (closePrices, rsiValues) => {
  const lastPrice = closePrices[closePrices.length - 1];
  const prevPrice = closePrices[closePrices.length - 2];
  const lastRSI = rsiValues[rsiValues.length - 1];
  const prevRSI = rsiValues[rsiValues.length - 2];

  // Divergência de alta: o preço faz mínimas mais baixas, mas o RSI faz mínimas mais altas
  return lastPrice < prevPrice && lastRSI > prevRSI;
};

// Função para verificar se há um pico de volume
const isVolumeSpike = (latestVolume, avgVolume, threshold = 1.5) => {
  return latestVolume > threshold * avgVolume;
};

// Função para colocar uma ordem de compra
const placeBuyOrder = async (symbol, quantity) => {
  try {
    const order = await client.order({
      symbol: symbol,
      side: "BUY",
      type: "MARKET",
      quantity: quantity,
    });
    console.log("Ordem de compra realizada:", order);
  } catch (error) {
    console.error("Erro ao realizar a ordem de compra:", error);
  }
};

// Função de trade para detectar oportunidades de compra após correção
const detectBuyOpportunity = async (
  symbol,
  rsiPeriod,
  macdFastPeriod,
  macdSlowPeriod,
  macdSignalPeriod,
  bbPeriod,
  bbStdDev
) => {
	const startTime = getStartTimestamp(config.startTime); 
	const endTime =	config.endTime === "now"?  getStartTimestamp(new Date()): getStartTimestamp(config.endTime); 		
	const limit = config.limitCandles
  try {
    // Obter dados de candlestick com intervalo de 15 minutos
    const candles = await getCandleData(symbol, config.candleTime, limit,startTime, endTime);
    const closePrices = candles.map((candle) => parseFloat(candle.close));

    // Calcular RSI, MACD, Bollinger Bands, Volume, e EMA
    const rsiValues = calculateRSI(closePrices, rsiPeriod);
    const macdValues = calculateMACD(
      closePrices,
      macdFastPeriod,
      macdSlowPeriod,
      macdSignalPeriod
    );
    const bbValues = calculateBollingerBands(closePrices, bbPeriod, bbStdDev);
    const { avgVolume, latestVolume } = analyzeVolume(candles);
    const ema50 = calculateEMA(closePrices, 50);
	const suportPrice = await calculateSupport(candles);

    // Obter os valores mais recentes
    const latestRSI = rsiValues[rsiValues.length - 1];
    const latestMACD = macdValues[macdValues.length - 1];
    const latestBB = bbValues[bbValues.length - 1];
    const latestClose = closePrices[closePrices.length - 1];
    const latestEMA50 = ema50[ema50.length - 1];

    console.log(`RSI atual: ${latestRSI}`);
    console.log(`MACD atual:`, latestMACD);
    console.log(`Bollinger Bands superior: ${latestBB.upper}, inferior: ${latestBB.lower}` );
    console.log(`Volume médio: ${avgVolume}, Volume atual: ${latestVolume}`);
    console.log(`EMA de 50 períodos: ${latestEMA50}`);
	console.log(`Preço de Suporte: ${suportPrice}`)
	

    // Condições para compra

    // 1. Verificação de Correção com RSI (Abaixo de 60)
    if (latestRSI < 60) {
      console.log("RSI abaixo de 60: possível correção detectada.");

      // 2. Cruzamento de Alta no MACD
      if (latestMACD.MACD > latestMACD.signal) {
      	console.log("Cruzamento de alta no MACD: sinal de compra confirmado.");

      	// 3. Preço acima da EMA de 50 períodos
      	if (latestClose > latestEMA50) {
      		console.log(
      			"Preço está acima da EMA de 50 períodos: tendência de alta confirmada."
      		);

      		// 4. Preço próximo à banda inferior de Bollinger
      		if (latestClose <= latestBB.lower) {
      			console.log(
      				"Preço próximo à banda inferior de Bollinger: ótima oportunidade de compra."
      			);

      			// 5. Verificação de volume acima da média
      			if (latestVolume >= avgVolume) {
      				console.log(
      					"Volume atual acima da média: confirmando força no mercado."
      				);

      				// 6. Verificação de divergência no RSI
      				if (checkRSIDivergence(closePrices, rsiValues)) {
      					console.log(
      						"Divergência de alta no RSI detectada: sinal de compra."
      					);

      					// Colocar ordem de compra
      					// await placeBuyOrder(symbol, 0.001); // Exemplo: Comprar 0.001 BTC
      					console.log("TACALEPAU MARCO VEIO!!!");
      				}
      			}
      		}
      	}
      }
    } else {
      console.log(
        "RSI ainda muito elevado. Aguardando melhor oportunidade de compra."
      );
    }
  } catch (error) {
    console.error("Erro ao detectar oportunidade de compra:", error);
  }
};

///---alteração da construção do checkBuyOppourtunity


async function checkBuyOpportunity(
    symbol,
    rsiPeriod,
    macdFastPeriod,
    macdSlowPeriod,
    macdSignalPeriod
) {
    try {
        const startTime = getStartTimestamp(config.startTime);
        const endTime = config.endTime === "now" ? Date.now() : getStartTimestamp(config.endTime);
        const limit = config.limitCandles + macdSlowPeriod; // Incluímos candles extras para garantir cálculos corretos

        // Obter dados de candlestick com intervalo de 1 minuto
        const candles = await getCandleData(symbol, config.candleTime, limit, startTime, endTime);
        
        // Iterar sobre cada candle e calcular o MACD e o RSI com os preços até aquele candle
        for (let i = macdSlowPeriod; i < candles.length; i++) { // Começa após o número mínimo de candles para MACD
            const candle = candles[i];

            // Pega os preços de fechamento até o candle atual
            const closePricesUntilNow = candles.slice(0, i + 1).map(c => parseFloat(c.close));

            // Calcula RSI até o candle atual
            const rsiValues = calculateRSI(closePricesUntilNow, rsiPeriod);
            const latestRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

            // Calcula MACD até o candle atual
            const macdValues = calculateMACD(closePricesUntilNow, macdFastPeriod, macdSlowPeriod, macdSignalPeriod);
            const latestMACD = macdValues.length > 0 ? macdValues[macdValues.length - 1] : null;

            // Mostrar candle com indicadores MACD e RSI
            const candleTimeBrasilia = new Date(candle.openTime + config.timeZoneBrasiliaTimestamp).toISOString();
            console.log(`${i} - Candle de: ${candleTimeBrasilia}`);
            console.log(`RSI: ${latestRSI}`);
            console.log(`MACD:`, latestMACD);

            // Condições para compra com base no MACD e RSI
            if (latestRSI && latestMACD && latestMACD.histogram >= 0) {
                console.log("Mercado em alta. Oportunidade de compra.");
            } else if (latestMACD && latestMACD.histogram < 0) {
                console.log("Mercado em baixa. Aguardar tendência de alta.");
            }
        }
    } catch (error) {
        console.error("Erro ao detectar oportunidade de compra:", error);
    }
}



// const checkBuyOpportunity = async (
// 	symbol,
// 	rsiPeriod
//   ) => {
// 	const startTime = getStartTimestamp(config.startTime); 
// 	const endTime = config.endTime === "now" ? Date.now() : getStartTimestamp(config.endTime); 
// 	const limit = config.limitCandles;
  
// 	try {
// 	  // Obter dados de candlestick com intervalo de 15 minutos
// 	  const candles = await getCandleData(symbol, config.candleTime, limit, startTime, endTime);
  
// 	  // Definindo o deslocamento de horário de Brasília (UTC-3)
// 	  const offsetBrasilia = 3 * 60 * 60 * 1000; // 3 horas em milissegundos
  
// 	  // Adicionando candleTimeBrasilia (horário de Brasília) a cada candle
// 	  const candlesWithBrasiliaTime = candles.map((candle) => {
// 		const candleTimeBrasilia = new Date(candle.openTime + offsetBrasilia).toISOString(); // Converte para horário de Brasília
// 		return {
// 		  ...candle,
// 		  candleTimeBrasilia // Adiciona o campo candleTimeBrasilia (horário de Brasília)
// 		};
// 	  });
  
// 	  // Logando o candleTimeBrasilia e o preço de fechamento para cada candle
// 	//   candlesWithBrasiliaTime.forEach((candle) => {
// 	// 	console.log(`Candle de ${candle.candleTimeBrasilia} (Horário de Brasília) - Preço de fechamento: ${candle.close}`);
// 	//   });
  
// 	  // Extraindo os preços de fechamento para calcular RSI
// 	  const closePrices = candlesWithBrasiliaTime.map((candle) => parseFloat(candle.close));
  
// 	  // Calcular RSI
// 	  const rsiValues = calculateRSI(closePrices, rsiPeriod);
  
// 	  // Obter o valor mais recente do RSI
// 	  const latestRSI = rsiValues[rsiValues.length - 1];
// 	  console.log(`RSI atual: ${latestRSI}`);
  
// 	  // Condições para compra
// 	  if (latestRSI < 60) {
// 		console.log("RSI abaixo de 60: possível correção detectada.");
// 	  } else {
// 		console.log("RSI ainda muito elevado. Aguardando melhor oportunidade de compra.");
// 	  }
// 	} catch (error) {
// 	  console.error("Erro ao detectar oportunidade de compra:", error);
// 	}
//   };
  



// Função principal de monitoramento
const monitorarMercado = async () => {
  //checkBalance();
  getBitcoinPrice();
  checkBuyOpportunity("BTCBRL",config.rsiPeriod,config.MACD.macdFastPeriod,
	config.MACD.macdSignalPeriod,
	    config.MACD.macdSlowPeriod,)
//   await detectBuyOpportunity(
//     "BTCBRL",
//     config.RSI,
//     config.MACD.macdFastPeriod,
//     config.MACD.macdSignalPeriod,
//     config.MACD.macdSlowPeriod,
//     config.Bollinger.bbPeriod,
//     config.Bollinger.bbStdDev
//   ); 
};



// Executa a função de monitoramento
monitorarMercado();
