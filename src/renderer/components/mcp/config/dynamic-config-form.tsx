import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { MCPConfigField } from '@/types/mcp';

interface DynamicConfigFormProps {
  fields: MCPConfigField[];
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  errors?: Record<string, string>;
}

export function DynamicConfigForm({ 
  fields, 
  values, 
  onChange, 
  errors = {} 
}: DynamicConfigFormProps) {
  const handleFieldChange = (fieldKey: string, value: any) => {
    const newValues = { ...values, [fieldKey]: value };
    onChange(newValues);
  };

  const renderField = (field: MCPConfigField) => {
    const fieldId = `field-${field.key}`;
    const fieldValue = values[field.key] || field.defaultValue || '';
    const hasError = errors[field.key];

    const commonProps = {
      id: fieldId,
      value: fieldValue,
      onChange: (value: any) => handleFieldChange(field.key, value),
    };

    switch (field.type) {
      case 'text':
        return (
          <Input
            {...commonProps}
            type="text"
            placeholder={field.placeholder}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={hasError ? 'border-red-500' : ''}
          />
        );

      case 'password':
        return (
          <Input
            {...commonProps}
            type="password"
            placeholder={field.placeholder}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={hasError ? 'border-red-500' : ''}
          />
        );

      case 'number':
        return (
          <Input
            {...commonProps}
            type="number"
            placeholder={field.placeholder}
            onChange={(e) => handleFieldChange(field.key, parseFloat(e.target.value) || 0)}
            className={hasError ? 'border-red-500' : ''}
          />
        );

      case 'select':
        return (
          <Select 
            value={fieldValue} 
            onValueChange={(value) => handleFieldChange(field.key, value)}
          >
            <SelectTrigger className={hasError ? 'border-red-500' : ''}>
              <SelectValue placeholder={field.placeholder || 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(option => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={fieldId}
              checked={fieldValue === true || fieldValue === 'true'}
              onCheckedChange={(checked) => 
                handleFieldChange(field.key, checked)
              }
            />
            <Label htmlFor={fieldId} className="text-sm font-medium">
              {field.description || field.label}
            </Label>
          </div>
        );

      default:
        return (
          <Textarea
            {...commonProps}
            placeholder={field.placeholder}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={hasError ? 'border-red-500' : ''}
          />
        );
    }
  };

  if (!fields || fields.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-4">
        No configuration fields available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.key} className="space-y-2">
          {/* Label (except for boolean fields which handle their own labels) */}
          {field.type !== 'boolean' && (
            <Label htmlFor={`field-${field.key}`} className="text-sm font-medium">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
          )}

          {/* Field Input */}
          {renderField(field)}

          {/* Description */}
          {field.type !== 'boolean' && field.description && (
            <p className="text-xs text-muted-foreground">
              {field.description}
            </p>
          )}

          {/* Error Message */}
          {errors[field.key] && (
            <p className="text-xs text-red-500">
              {errors[field.key]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}