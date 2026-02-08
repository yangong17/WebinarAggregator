import json
import csv
import os

input_path = 'data/webinars.json'
output_path = 'data/webinars.csv'

try:
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    webinars = data.get('webinars', [])
    
    if not webinars:
        print("No webinars found in JSON.")
    else:
        keys = webinars[0].keys()
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(webinars)
            print(f"Successfully converted {len(webinars)} webinars to {output_path}")

except Exception as e:
    print(f"Error: {e}")
