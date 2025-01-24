window.onload = () => {
    setupTabs();
    setupFileInputs();
    window.dispatchEvent(new Event('resize'));
};

function setupTabs() {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(button.dataset.tab + 'Tab').classList.add('active');
            window.dispatchEvent(new Event('resize'));
        });
    });
}

function plot(data, div, title, type='heatmap', opts={}) {
    const config = {
        heatmap: {
            z: data,
            type: 'heatmap',
            colorscale: opts.colorscale || 'Viridis',
            showscale: true
        },
        scatter: {
            x: data.x,
            y: data.y,
            mode: opts.mode || 'lines',
            name: opts.name,
            type: 'scatter',
            marker: opts.marker
        }
    };
    
    Plotly.newPlot(div, [config[type]], {
        title,
        xaxis: {title: opts.xTitle || 'X Position'},
        yaxis: {title: opts.yTitle || 'Y Position'},
        showlegend: opts.showLegend,
        margin: {t:50, b:50, l:50, r:50}
    });
}

async function readFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) reject(new Error('No file selected'));
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(new Error('File read error'));
        reader.readAsText(file);
    });
}

const parsers = {
    time: async (file) => {
        const content = await readFile(file);
        if (!content) throw new Error('Empty file');
        
        const data = content.split('\n')
            .filter(line => line && line.includes('time ='))
            .map(line => {
                const m = line.match(/time\s*=\s*([\d.eE+-]+)\s+u,v,p\s*\(40,25\)\s*=\s*([-\d.eE+-]+)\s+([-\d.eE+-]+)\s+([-\d.eE+-]+)/);
                return m ? {time: +m[1], u: +m[2], v: +m[3], p: +m[4]} : null;
            })
            .filter(x => x);

        if (data.length === 0) throw new Error('No valid time evolution data found');

        const traces = [
            {x: data.map(d => d.time), y: data.map(d => d.u), name: 'U Velocity', type: 'scatter', mode: 'lines'},
            {x: data.map(d => d.time), y: data.map(d => d.v), name: 'V Velocity', type: 'scatter', mode: 'lines'},
            {x: data.map(d => d.time), y: data.map(d => d.p), name: 'Pressure', type: 'scatter', mode: 'lines'}
        ];

        Plotly.newPlot('timePlot', traces, {
            title: 'Time Evolution at Point (40,25)',
            xaxis: {title: 'Time (s)'},
            yaxis: {title: 'Value'},
            showlegend: true
        });
    },

    solution: async (file) => {
        const content = await readFile(file);
        if (!content) throw new Error('Empty file');
        const lines = content.split('\n').filter(l => l.trim());
        const m = lines.find(l => l.includes('m, n =')).match(/m, n =\s*(\d+)\s+(\d+)/);
        if (!m) throw new Error('Grid dimensions not found');
        const [m1, n1] = [+m[1], +m[2]];

        const getData = (start, n) => {
            const data = [];
            for (let i = 0; i < n; i++) {
                data.push(lines[start + i].trim().split(/\s+/).map(Number));
            }
            return data;
        };

        const uStart = lines.findIndex(l => l.includes('velocity u')) + 1;
        const vStart = lines.findIndex(l => l.includes('velocity v')) + 1;
        const pStart = lines.findIndex(l => l.includes('pressure')) + 1;

        plot(getData(uStart, n1), 'uPlot', 'U Velocity Distribution', 'heatmap', {colorscale: 'RdBu'});
        plot(getData(vStart, n1), 'vPlot', 'V Velocity Distribution', 'heatmap', {colorscale: 'RdBu'});
        plot(getData(pStart, n1), 'pPlot', 'Pressure Distribution');
    },

    divergent: async (file) => {
        const content = await readFile(file);
        if (!content) throw new Error('Empty file');
        const start = content.split('\n').findIndex(l => l.includes('divergent velocity')) + 1;
        const data = content.split('\n').slice(start)
            .map(l => l.trim().split(/\s+/).map(Number))
            .filter(row => row.length > 1);
        plot(data, 'divPlot', 'Velocity Field Divergence', 'heatmap', {colorscale: 'RdBu'});
    },

    grid: async (file) => {
        const content = await readFile(file);
        if (!content) throw new Error('Empty file');

        const lines = content.split('\n').filter(line => line.trim());
        const dimLine = lines.find(line => line.includes('m, n ='));
        if (!dimLine) throw new Error('Grid dimensions line not found');

        const m = dimLine.match(/m, n =\s*(\d+)\s+(\d+)/);
        if (!m) throw new Error('Invalid grid dimension format');

        const gridIndex = lines.findIndex(line => line.includes('grid points ='));
        if (gridIndex === -1 || gridIndex + 2 >= lines.length) {
            throw new Error('Grid points data not found or incomplete');
        }

        const xPoints = lines[gridIndex + 1].trim().split(/\s+/).map(Number);
        const yPoints = lines[gridIndex + 2].trim().split(/\s+/).map(Number);

        document.getElementById('gridInfo').innerHTML = `
            <h3>Grid Information</h3>
            <p>Grid Size: ${m[1]} × ${m[2]}</p>
            <p>X Range: ${Math.min(...xPoints)} → ${Math.max(...xPoints)}</p>
            <p>Y Range: ${Math.min(...yPoints)} → ${Math.max(...yPoints)}</p>
        `;

        plot({x: xPoints, y: yPoints}, 'gridInfo', 'Grid Points Distribution', 'scatter', 
            {mode: 'markers', marker: {size: 5, color: 'blue'}});
    }
};

function setupFileInputs() {
    ['time', 'solution', 'divergent', 'grid'].forEach(type => {
        document.getElementById(`${type}File`).addEventListener('change', async e => {
            try {
                await parsers[type](e.target.files[0]);
                document.getElementById(`${type}Err`).textContent = '';
            } catch(err) {
                document.getElementById(`${type}Err`).textContent = `Error: ${err.message}`;
                console.error(err);
            }
        });
    });
}