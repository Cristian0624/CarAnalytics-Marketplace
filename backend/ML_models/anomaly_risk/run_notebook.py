"""Run from the project venv; completed model fits are reused from the notebook's cache."""
from pathlib import Path
import sys
import nbformat
from nbclient import NotebookClient
from jupyter_client import KernelManager

path = Path(__file__).with_name('anomaly_risk.ipynb').resolve()
notebook = nbformat.read(path, as_version=4)

def starting(cell, cell_index, **kwargs):
    if cell.cell_type == 'code':
        print(f'Executing cell {cell_index}: {cell.source.splitlines()[0]}', flush=True)

def checkpoint(**kwargs):
    nbformat.write(notebook, path)

# Use the interpreter launching this runner, regardless of a global Jupyter kernel registration.
manager = KernelManager(kernel_name='python3')
manager.kernel_spec.argv = [sys.executable, '-m', 'ipykernel_launcher', '-f', '{connection_file}']
client = NotebookClient(notebook, km=manager, timeout=7200, resources={'metadata': {'path': str(path.parent)}},
                        on_cell_start=starting, on_cell_executed=checkpoint)
try:
    client.execute()
finally:
    nbformat.write(notebook, path)
    if manager.has_kernel:
        manager.shutdown_kernel(now=True)
print('Notebook completed.', flush=True)
