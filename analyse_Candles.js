const xlsx = require('xlsx');
const fs = require('fs');

// Função para ler a planilha
function lerPlanilha(caminho) {
    const workbook = xlsx.readFile(caminho);
    const sheetName = workbook.SheetNames[2];
    const worksheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(worksheet);
}

// Função para calcular o percentual de lucro ou prejuízo
function calcularPercentual(precoCompra, precoVenda) {
    const percentual = ((precoVenda - precoCompra) / precoCompra) * 100;
    return percentual.toFixed(2); // Limita o percentual a 2 casas decimais
}

// Função para processar a planilha e gerar os logs
function processarPlanilha(dados) {
    let precoCompra = null;
    let candleCompra = null;
    let horaCompra = null;
    let resultLog = '';

    dados.forEach((linha, index) => {
        const histogramaMacd = parseFloat(linha.MacdHistograma);
        const linhaMacd = parseFloat(linha.LinhaMacd);
        const sinalMacd = parseFloat(linha.MacdSinal);
        

        const precoFechamento = parseFloat(linha['Valor Fechamento']);
        const candle = linha['Sequencia Candle'];
        const rsi = parseFloat(linha.RSI);
        const horario = `${linha.Data} ${linha.Hora}`;

        // Se o histograma é positivo e ainda não temos um preço de compra
        if (histogramaMacd > 0 && precoCompra === null ) {
            precoCompra = precoFechamento; // Guardar o preço de compra
            candleCompra = candle; // Guardar o candle de compra
            horaCompra = horario; // Guardar o horário de compra
            
        }

        // Quando o histograma fica negativo e já temos um preço de compra
        if (histogramaMacd < 0 && precoCompra !== null && rsi < 45) {
            const precoVenda = precoFechamento; // Pegar o preço de venda
            const candleVenda = candle; // Candle de venda
            const horaVenda = horario; // Horário de venda

            // Calcular o percentual de lucro ou prejuízo
            const percentual = calcularPercentual(precoCompra, precoVenda);
            const lucroOuPrejuizo = percentual >= 0 ? percentual : `-${Math.abs(percentual)}`;

            // Logar a transação
            resultLog += `Candle Compra: ${candleCompra}, Candle Venda: ${candleVenda}, ` +
                         `Horário Compra: ${horaCompra}, Horário Venda: ${horaVenda}, ` +
                         `Preço Compra: ${precoCompra}, Preço Venda: ${precoVenda}, ` +
                         `Percentual: ${lucroOuPrejuizo}%\n`;

            // Resetar os valores para buscar outra oportunidade
            precoCompra = null;
            candleCompra = null;
            horaCompra = null;
        }
    });

    // Salvar o log em um arquivo de texto
    fs.writeFileSync('Trades.txt', resultLog, 'utf8');
    console.log("Log de transações gerado com sucesso em 'Trades.txt'");
}

// Caminho do arquivo Excel
const caminhoPlanilha = 'C:/temp/Historico_Bitcoin_02-01a18-09.xlsx';

// Executar o script
const dados = lerPlanilha(caminhoPlanilha);
processarPlanilha(dados);
